/**
 * Browser Worker — Playwright-based web automation
 * Opens URLs, takes screenshots, extracts text, fills forms
 * Uses playwright-core with system Chromium
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { validateNetworkRequest } from "./security";
import { logger, startTrace, endTrace, recordMetric } from "./observability";

const BROWSER_TIMEOUT = 30_000;
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  // Try to find system chromium
  const executablePaths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    process.env.CHROME_PATH || "",
  ].filter(Boolean);

  let executablePath = "";
  for (const p of executablePaths) {
    try {
      const { accessSync } = await import("fs");
      accessSync(p);
      executablePath = p;
      break;
    } catch {}
  }

  browserInstance = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  return browserInstance;
}

export interface BrowserResult {
  success: boolean;
  type: "screenshot" | "text" | "data" | "error";
  content: string; // base64 for screenshots, text for others
  url?: string;
  title?: string;
  error?: string;
}

/**
 * Take a screenshot of a URL
 */
export async function takeScreenshot(url: string): Promise<BrowserResult> {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle", timeout: BROWSER_TIMEOUT });
    const title = await page.title();
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    const base64 = screenshot.toString("base64");
    return {
      success: true,
      type: "screenshot",
      content: base64,
      url,
      title,
    };
  } catch (error: any) {
    return {
      success: false,
      type: "error",
      content: "",
      error: error?.message || "Screenshot failed",
      url,
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * Extract text content from a URL
 */
export async function extractText(url: string, selector?: string): Promise<BrowserResult> {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: BROWSER_TIMEOUT });
    const title = await page.title();

    let text: string;
    if (selector) {
      const element = await page.$(selector);
      text = element ? (await element.textContent()) || "" : `No element found for selector: ${selector}`;
    } else {
      text = await page.evaluate(() => {
        // Extract main content, removing scripts and styles
        const body = document.body.cloneNode(true) as HTMLElement;
        body.querySelectorAll("script, style, nav, footer, header").forEach(el => el.remove());
        return body.innerText.trim().slice(0, 10000);
      });
    }

    return {
      success: true,
      type: "text",
      content: text,
      url,
      title,
    };
  } catch (error: any) {
    return {
      success: false,
      type: "error",
      content: "",
      error: error?.message || "Text extraction failed",
      url,
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * Scrape structured data from a URL using a CSS selector
 */
export async function scrapeData(
  url: string,
  selectors: Record<string, string>
): Promise<BrowserResult> {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: BROWSER_TIMEOUT });
    const title = await page.title();

    const data: Record<string, string[]> = {};
    for (const [key, selector] of Object.entries(selectors)) {
      const elements = await page.$$(selector);
      data[key] = await Promise.all(
        elements.slice(0, 20).map(async (el) => (await el.textContent()) || "")
      );
    }

    return {
      success: true,
      type: "data",
      content: JSON.stringify(data, null, 2),
      url,
      title,
    };
  } catch (error: any) {
    return {
      success: false,
      type: "error",
      content: "",
      error: error?.message || "Data scraping failed",
      url,
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * Parse a browser task from natural language into an action
 */
export function parseBrowserTask(message: string): {
  action: "screenshot" | "extract" | "scrape";
  url: string;
  selector?: string;
} | null {
  const urlMatch = message.match(/https?:\/\/[^\s"'<>]+/);
  if (!urlMatch) return null;

  const url = urlMatch[0];
  const lower = message.toLowerCase();

  if (lower.includes("screenshot") || lower.includes("capture") || lower.includes("snap")) {
    return { action: "screenshot", url };
  }
  if (lower.includes("scrape") || lower.includes("extract data") || lower.includes("pricing")) {
    return { action: "scrape", url };
  }
  // Default to text extraction
  return { action: "extract", url };
}

/**
 * Execute a browser task and return result
 */
export async function executeBrowserTask(message: string): Promise<BrowserResult> {
  const task = parseBrowserTask(message);
  if (!task) {
    return {
      success: false,
      type: "error",
      content: "",
      error: "Could not parse browser task. Please include a URL in your request.",
    };
  }

  // Security: validate URL before navigation
  const urlCheck = validateNetworkRequest(task.url);
  if (!urlCheck.allowed) {
    logger.warn(`[Security] Browser URL blocked: ${task.url} — ${urlCheck.reason}`, { worker: "browser" });
    return {
      success: false,
      type: "error",
      content: "",
      error: `URL blocked by security policy: ${urlCheck.reason}`,
    };
  }

  const span = startTrace("browser_task", { service: "browser", worker: "browser", attributes: { url: task.url, action: task.action } });
  logger.info(`[Browser] Executing ${task.action} on ${task.url}`, { worker: "browser" });
  recordMetric("browser_tasks_total", 1, "counter", { action: task.action });

  let result: BrowserResult;
  try {
    switch (task.action) {
      case "screenshot":
        result = await takeScreenshot(task.url);
        break;
      case "scrape":
        result = await scrapeData(task.url, {
          headings: "h1, h2, h3",
          paragraphs: "p",
          links: "a[href]",
          prices: "[class*=price], [class*=cost], .amount",
        });
        break;
      case "extract":
        result = await extractText(task.url, task.selector);
        break;
      default:
        result = { success: false, type: "error", content: "", error: "Unknown action" };
    }
    endTrace(span, result.success ? "completed" : "failed");
    return result;
  } catch (err: any) {
    endTrace(span, "failed");
    recordMetric("browser_errors_total", 1, "counter", { action: task.action });
    return { success: false, type: "error", content: "", error: err?.message || "Browser task failed" };
  }
}

/**
 * Cleanup browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
