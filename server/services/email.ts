/**
 * Quoratorium Email Service
 * Uses Resend for transactional emails with branded HTML templates.
 */
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "Quoratorium <noreply@quoratorium.com>";

// ─── Brand Constants ───────────────────────────────────────────────────────────
const BRAND = {
  bgColor: "#000000",
  cardBg: "#0a0a0f",
  borderColor: "#1a1a2e",
  textPrimary: "#e0e0e0",
  textSecondary: "#888888",
  accentGreen: "#22c55e",
  accentGreenDark: "#16a34a",
  chromeGray: "#c0c0c0",
  iconUrl: "https://qworkspace-f3vutepv.manus.space/manus-storage/icon-192x192_59428221.png",
};

// ─── Base Template ─────────────────────────────────────────────────────────────
function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bgColor};padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${BRAND.iconUrl}" alt="Q" width="48" height="48" style="display:block;border-radius:8px;" />
              <p style="margin:12px 0 0;font-size:18px;font-weight:600;color:${BRAND.accentGreen};letter-spacing:1px;">QUORATORIUM</p>
            </td>
          </tr>
          <!-- Content Card -->
          <tr>
            <td style="background-color:${BRAND.cardBg};border:1px solid ${BRAND.borderColor};border-radius:12px;padding:40px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:${BRAND.textSecondary};">
                Quoratorium — The AI Mothership
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:${BRAND.textSecondary};">
                Multi-model orchestration platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email Templates ───────────────────────────────────────────────────────────

function welcomeEmailHtml(userName: string): string {
  const name = userName || "Captain";
  return baseTemplate(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.textPrimary};">
      Welcome aboard, ${name}
    </h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
      You've been granted access to the AI Mothership. Quoratorium orchestrates multiple AI models — OpenAI, Anthropic, Perplexity, and more — under one unified command interface.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="padding:12px 16px;border-left:3px solid ${BRAND.accentGreen};background-color:rgba(34,197,94,0.05);border-radius:0 6px 6px 0;">
          <p style="margin:0;font-size:13px;color:${BRAND.accentGreen};font-weight:600;">SYSTEM STATUS</p>
          <p style="margin:4px 0 0;font-size:13px;color:${BRAND.textSecondary};">All orchestration engines online. Ready for your first mission.</p>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:${BRAND.textSecondary};">
      Your workspace is configured and waiting. Launch when ready.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
      <tr>
        <td style="background-color:${BRAND.accentGreen};border-radius:6px;">
          <a href="https://quoratorium.com" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#000000;text-decoration:none;">
            Enter Quoratorium →
          </a>
        </td>
      </tr>
    </table>
  `);
}

function buildCompleteEmailHtml(projectName: string, deployUrl: string): string {
  return baseTemplate(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.textPrimary};">
      Build Complete ✓
    </h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
      Your project has been successfully built and deployed.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:rgba(34,197,94,0.04);border:1px solid ${BRAND.borderColor};border-radius:8px;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:12px;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${BRAND.textSecondary};">Project</p>
                <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:${BRAND.textPrimary};">${projectName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:12px;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${BRAND.textSecondary};">Status</p>
                <p style="margin:4px 0 0;font-size:15px;color:${BRAND.accentGreen};font-weight:600;">● Deployed</p>
              </td>
            </tr>
            <tr>
              <td>
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${BRAND.textSecondary};">URL</p>
                <a href="${deployUrl}" style="margin:4px 0 0;display:inline-block;font-size:14px;color:${BRAND.accentGreen};text-decoration:underline;">${deployUrl}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr>
        <td style="background-color:${BRAND.accentGreen};border-radius:6px;">
          <a href="${deployUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#000000;text-decoration:none;">
            View Deployment →
          </a>
        </td>
      </tr>
    </table>
  `);
}

export interface WeeklySummaryStats {
  totalConversations: number;
  totalMessages: number;
  totalProjects: number;
  totalDeployments: number;
  tokensUsed: number;
  topModel?: string;
}

function weeklySummaryEmailHtml(stats: WeeklySummaryStats): string {
  return baseTemplate(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${BRAND.textPrimary};">
      Weekly Summary
    </h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
      Here's your Quoratorium activity for the past 7 days.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.borderColor};border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.borderColor};">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:13px;color:${BRAND.textSecondary};">Conversations</td>
              <td align="right" style="font-size:15px;font-weight:600;color:${BRAND.textPrimary};">${stats.totalConversations}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.borderColor};">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:13px;color:${BRAND.textSecondary};">Messages Sent</td>
              <td align="right" style="font-size:15px;font-weight:600;color:${BRAND.textPrimary};">${stats.totalMessages}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.borderColor};">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:13px;color:${BRAND.textSecondary};">Projects Active</td>
              <td align="right" style="font-size:15px;font-weight:600;color:${BRAND.textPrimary};">${stats.totalProjects}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.borderColor};">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:13px;color:${BRAND.textSecondary};">Deployments</td>
              <td align="right" style="font-size:15px;font-weight:600;color:${BRAND.accentGreen};">${stats.totalDeployments}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.borderColor};">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:13px;color:${BRAND.textSecondary};">Tokens Used</td>
              <td align="right" style="font-size:15px;font-weight:600;color:${BRAND.textPrimary};">${stats.tokensUsed.toLocaleString()}</td>
            </tr>
          </table>
        </td>
      </tr>
      ${stats.topModel ? `<tr>
        <td style="padding:16px 20px;">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:13px;color:${BRAND.textSecondary};">Top Model</td>
              <td align="right" style="font-size:15px;font-weight:600;color:${BRAND.accentGreen};">${stats.topModel}</td>
            </tr>
          </table>
        </td>
      </tr>` : ""}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
      <tr>
        <td style="background-color:${BRAND.accentGreen};border-radius:6px;">
          <a href="https://quoratorium.com" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#000000;text-decoration:none;">
            Open Dashboard →
          </a>
        </td>
      </tr>
    </table>
  `);
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, userName: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Welcome to Quoratorium — The AI Mothership",
      html: welcomeEmailHtml(userName),
    });
    if (error) {
      console.error("[Email] Failed to send welcome email:", error);
      return false;
    }
    console.log(`[Email] Welcome email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("[Email] Error sending welcome email:", err);
    return false;
  }
}

export async function sendBuildCompleteEmail(
  to: string,
  projectName: string,
  deployUrl: string
): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `✓ Build Complete — ${projectName}`,
      html: buildCompleteEmailHtml(projectName, deployUrl),
    });
    if (error) {
      console.error("[Email] Failed to send build complete email:", error);
      return false;
    }
    console.log(`[Email] Build complete email sent to ${to} for project ${projectName}`);
    return true;
  } catch (err) {
    console.error("[Email] Error sending build complete email:", err);
    return false;
  }
}

export async function sendWeeklySummaryEmail(
  to: string,
  stats: WeeklySummaryStats
): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Your Weekly Quoratorium Summary",
      html: weeklySummaryEmailHtml(stats),
    });
    if (error) {
      console.error("[Email] Failed to send weekly summary email:", error);
      return false;
    }
    console.log(`[Email] Weekly summary email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("[Email] Error sending weekly summary email:", err);
    return false;
  }
}
