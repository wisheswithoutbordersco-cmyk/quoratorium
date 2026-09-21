import JSZip from "jszip";
import { PDFDocument, PDFImage, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { RecyclatoriumPlan } from "@shared/recyclatorium";

export interface RecyclatoriumPdfAsset {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  previewUrl?: string;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const INK = rgb(0.15, 0.18, 0.22);
const MUTED = rgb(0.38, 0.43, 0.47);
const PAPER = rgb(1, 0.995, 0.965);
const SOFT = rgb(0.965, 0.955, 0.91);

export function sanitizePdfText(value: unknown) {
  let text = String(value ?? "");
  try { text = text.normalize("NFKD"); } catch { /* no-op */ }
  return text
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function readableSourceName(value: string) {
  const withoutExtension = value.replace(/\.[^.]+$/, "");
  const uuidPrefix = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  if (uuidPrefix.test(withoutExtension)) {
    const remainder = withoutExtension.replace(uuidPrefix, "").replace(/^[-_]+/, "");
    if (!remainder || /^\d+$/.test(remainder)) return "Uploaded source artwork";
    return sanitizePdfText(remainder.replace(/[-_]+/g, " ")).slice(0, 58);
  }
  return sanitizePdfText(withoutExtension.replace(/[-_]+/g, " ")).slice(0, 58) || "Uploaded source artwork";
}

function colorFromHex(value: string | undefined, fallback = "#E27632") {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(value || "") ? value! : fallback;
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function wrapLines(font: PDFFont, value: string, size: number, maxWidth: number) {
  const words = sanitizePdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  options: { x: number; y: number; size: number; maxWidth: number; lineHeight?: number; color?: ReturnType<typeof rgb>; maxLines?: number },
) {
  const lineHeight = options.lineHeight ?? options.size * 1.28;
  const lines = wrapLines(font, value, options.size, options.maxWidth).slice(0, options.maxLines ?? 100);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * lineHeight,
      size: options.size,
      font,
      color: options.color ?? INK,
    });
  });
  return options.y - lines.length * lineHeight;
}

function drawPageNumber(page: PDFPage, font: PDFFont, number: number) {
  page.drawText(String(number), { x: 548, y: 24, size: 9, font, color: MUTED });
}

function drawWritingLines(page: PDFPage, x: number, y: number, width: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    page.drawLine({
      start: { x, y: y - index * 28 },
      end: { x: x + width, y: y - index * 28 },
      thickness: 0.8,
      color: rgb(0.72, 0.74, 0.72),
    });
  }
}

async function embedSupportedImage(pdf: PDFDocument, asset?: RecyclatoriumPdfAsset): Promise<PDFImage | null> {
  if (!asset) return null;
  try {
    if (asset.mimeType.includes("png")) return await pdf.embedPng(asset.bytes);
    if (asset.mimeType.includes("jpeg") || asset.mimeType.includes("jpg")) return await pdf.embedJpg(asset.bytes);
  } catch {
    return null;
  }
  return null;
}

function drawImageCard(page: PDFPage, image: PDFImage | null, assetName: string, accent: ReturnType<typeof rgb>) {
  const x = 356;
  const y = 408;
  const width = 206;
  const height = 205;
  page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1), borderColor: accent, borderWidth: 2 });

  if (image) {
    const scale = Math.min((width - 18) / image.width, (height - 42) / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    page.drawImage(image, {
      x: x + (width - imageWidth) / 2,
      y: y + 30 + (height - 42 - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
    });
  } else {
    page.drawRectangle({ x: x + 18, y: y + 46, width: width - 36, height: height - 76, color: SOFT });
    page.drawCircle({ x: x + width / 2, y: y + 114, size: 30, color: accent, opacity: 0.3 });
  }
}

function drawVocabularyChips(
  page: PDFPage,
  font: PDFFont,
  words: string[],
  accent: ReturnType<typeof rgb>,
) {
  let x = 50;
  const y = 342;
  for (const rawWord of words.slice(0, 6)) {
    const word = sanitizePdfText(rawWord).slice(0, 24);
    const chipWidth = Math.min(98, Math.max(58, font.widthOfTextAtSize(word, 10) + 20));
    if (x + chipWidth > 562) break;
    page.drawRectangle({ x, y, width: chipWidth, height: 26, color: accent, opacity: 0.16, borderColor: accent, borderWidth: 0.7 });
    page.drawText(word, { x: x + 10, y: y + 8, size: 10, font, color: INK });
    x += chipWidth + 8;
  }
}

export async function buildRecyclatoriumPdf(plan: RecyclatoriumPlan, assets: RecyclatoriumPdfAsset[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accents = plan.palette.length ? plan.palette : ["#E27632", "#2B8A78", "#F2C14E"];
  const assetMap = new Map(assets.map(asset => [asset.name, asset]));

  const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const coverAccent = colorFromHex(accents[0]);
  const coverAccent2 = colorFromHex(accents[1], "#2B8A78");
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  cover.drawRectangle({ x: 0, y: 0, width: 22, height: PAGE_HEIGHT, color: coverAccent });
  cover.drawCircle({ x: 540, y: 720, size: 94, color: coverAccent, opacity: 0.14 });
  cover.drawCircle({ x: 484, y: 670, size: 58, color: coverAccent2, opacity: 0.2 });
  cover.drawText("RECYCLATORIUM ORIGINAL", { x: 56, y: 724, size: 11, font: bold, color: coverAccent });
  let coverY = drawWrappedText(cover, bold, plan.title, { x: 56, y: 668, size: 34, maxWidth: 430, lineHeight: 40, maxLines: 3 });
  coverY = drawWrappedText(cover, regular, plan.subtitle, { x: 56, y: coverY - 14, size: 16, maxWidth: 430, lineHeight: 22, color: MUTED, maxLines: 3 });
  cover.drawRectangle({ x: 56, y: coverY - 48, width: 250, height: 32, color: coverAccent });
  cover.drawText(sanitizePdfText(plan.ageGrade), { x: 70, y: coverY - 37, size: 12, font: bold, color: rgb(1, 1, 1) });

  const coverImages: PDFImage[] = [];
  for (const asset of assets.slice(0, 3)) {
    const image = await embedSupportedImage(pdf, asset);
    if (image) coverImages.push(image);
  }
  const coverPositions = [
    { x: 56, y: 84, w: 230, h: 330 },
    { x: 304, y: 220, w: 252, h: 194 },
    { x: 304, y: 84, w: 252, h: 120 },
  ];
  coverImages.slice(0, 3).forEach((image, index) => {
    const pos = coverPositions[index];
    const scale = Math.min(pos.w / image.width, pos.h / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    cover.drawRectangle({ x: pos.x - 5, y: pos.y - 5, width: pos.w + 10, height: pos.h + 10, color: rgb(1, 1, 1), borderColor: coverAccent, borderWidth: 1.2 });
    cover.drawImage(image, { x: pos.x + (pos.w - w) / 2, y: pos.y + (pos.h - h) / 2, width: w, height: h });
  });
  if (coverImages.length === 0) {
    cover.drawRectangle({ x: 56, y: 84, width: 500, height: 330, color: SOFT });
    cover.drawCircle({ x: 306, y: 250, size: 92, color: coverAccent, opacity: 0.24 });
  }
  drawPageNumber(cover, regular, 1);

  const guide = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const guideAccent = colorFromHex(accents[1], "#2B8A78");
  guide.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  guide.drawRectangle({ x: 0, y: 710, width: PAGE_WIDTH, height: 82, color: guideAccent });
  guide.drawText("TEACHER GUIDE", { x: 48, y: 748, size: 12, font: bold, color: rgb(1, 1, 1) });
  guide.drawText(sanitizePdfText(plan.title), { x: 48, y: 722, size: 23, font: bold, color: rgb(1, 1, 1) });
  guide.drawText("What this pack develops", { x: 48, y: 665, size: 18, font: bold, color: INK });
  let y = 632;
  plan.teachingGoals.forEach((goal, index) => {
    guide.drawCircle({ x: 59, y: y + 3, size: 10, color: guideAccent, opacity: 0.18 });
    guide.drawText(String(index + 1), { x: 56, y, size: 10, font: bold, color: guideAccent });
    y = drawWrappedText(guide, regular, goal, { x: 82, y: y + 1, size: 12, maxWidth: 460, lineHeight: 17, maxLines: 2 }) - 18;
  });
  guide.drawText("Inside the pack", { x: 48, y: y - 2, size: 18, font: bold, color: INK });
  y -= 36;
  plan.activities.forEach((activity, index) => {
    guide.drawRectangle({ x: 48, y: y - 6, width: 516, height: 34, color: index % 2 === 0 ? SOFT : rgb(1, 1, 1), borderColor: rgb(0.86, 0.84, 0.78), borderWidth: 0.5 });
    guide.drawText(`${index + 1}. ${sanitizePdfText(activity.title)}`, { x: 62, y: y + 6, size: 11, font: bold, color: INK });
    y -= 42;
  });
  drawWrappedText(guide, regular, plan.visualSummary, { x: 48, y: 160, size: 10.5, maxWidth: 516, lineHeight: 15, color: MUTED, maxLines: 5 });
  drawPageNumber(guide, regular, 2);

  for (let index = 0; index < plan.activities.length; index += 1) {
    const activity = plan.activities[index];
    const accent = colorFromHex(accents[index % accents.length]);
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
    page.drawRectangle({ x: 0, y: 0, width: 16, height: PAGE_HEIGHT, color: accent });
    page.drawText(`ACTIVITY ${index + 1}`, { x: 48, y: 744, size: 11, font: bold, color: accent });
    const titleY = drawWrappedText(page, bold, activity.title, { x: 48, y: 711, size: 25, maxWidth: 510, lineHeight: 30, maxLines: 2 });
    page.drawRectangle({ x: 48, y: titleY - 56, width: 292, height: 50, color: accent, opacity: 0.12, borderColor: accent, borderWidth: 0.8 });
    page.drawText("LEARNING GOAL", { x: 62, y: titleY - 24, size: 8.5, font: bold, color: accent });
    drawWrappedText(page, regular, activity.objective, { x: 62, y: titleY - 41, size: 10.5, maxWidth: 260, lineHeight: 14, maxLines: 2 });

    page.drawText("Directions", { x: 48, y: 596, size: 15, font: bold, color: INK });
    drawWrappedText(page, regular, activity.instructions, { x: 48, y: 574, size: 11, maxWidth: 278, lineHeight: 16, color: INK, maxLines: 7 });

    const sourceAsset = assetMap.get(activity.sourceAsset) ?? assets[index % Math.max(assets.length, 1)];
    const sourceImage = await embedSupportedImage(pdf, sourceAsset);
    drawImageCard(page, sourceImage, activity.sourceAsset, accent);
    page.drawText("SOURCE SPARK", { x: 370, y: 426, size: 8, font: bold, color: accent });
    drawWrappedText(page, regular, readableSourceName(activity.sourceAsset), { x: 370, y: 414, size: 8.5, maxWidth: 174, lineHeight: 10, color: MUTED, maxLines: 2 });

    page.drawText("Word bank", { x: 48, y: 378, size: 13, font: bold, color: INK });
    drawVocabularyChips(page, regular, activity.vocabulary, accent);
    page.drawText("Your response", { x: 48, y: 306, size: 13, font: bold, color: INK });
    drawWrappedText(page, regular, activity.prompt, { x: 48, y: 284, size: 11.5, maxWidth: 516, lineHeight: 16, maxLines: 3 });
    drawWritingLines(page, 48, 220, 516, 5);
    page.drawRectangle({ x: 48, y: 44, width: 516, height: 48, color: accent, opacity: 0.1, borderColor: accent, borderWidth: 0.8 });
    page.drawText("TRY MORE", { x: 62, y: 72, size: 8, font: bold, color: accent });
    drawWrappedText(page, regular, activity.extension, { x: 130, y: 72, size: 9.5, maxWidth: 416, lineHeight: 12, maxLines: 2 });
    drawPageNumber(page, regular, index + 3);
  }

  const notes = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const notesAccent = colorFromHex(accents[2], "#F2C14E");
  notes.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  notes.drawRectangle({ x: 0, y: 710, width: PAGE_WIDTH, height: 82, color: notesAccent });
  notes.drawText("CREDITS & CLASSROOM NOTES", { x: 48, y: 744, size: 18, font: bold, color: INK });
  notes.drawText("Built from these source assets", { x: 48, y: 664, size: 16, font: bold, color: INK });
  let notesY = 632;
  assets.forEach((asset, index) => {
    notes.drawText(`${index + 1}. ${readableSourceName(asset.name)}`, { x: 58, y: notesY, size: 11, font: regular, color: INK });
    notesY -= 22;
  });
  notes.drawText("How the product is new", { x: 48, y: notesY - 22, size: 16, font: bold, color: INK });
  drawWrappedText(notes, regular, plan.whyTogether, { x: 48, y: notesY - 50, size: 11, maxWidth: 516, lineHeight: 16, maxLines: 8 });
  notes.drawRectangle({ x: 48, y: 72, width: 516, height: 92, color: notesAccent, opacity: 0.12, borderColor: notesAccent, borderWidth: 0.8 });
  drawWrappedText(notes, regular, "Review all source licenses before commercial distribution. Recyclatorium creates new layouts and learning prompts, but it does not grant rights to third-party source artwork.", { x: 66, y: 136, size: 10.5, maxWidth: 480, lineHeight: 16, color: INK, maxLines: 5 });
  drawPageNumber(notes, regular, plan.activities.length + 3);

  pdf.setTitle(sanitizePdfText(plan.title));
  pdf.setSubject("Original printable activity pack created with Recyclatorium");
  pdf.setCreator("Quoratorium Recyclatorium");
  return pdf.save();
}

function canvasWrapLines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadPreview(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Preview image failed to load"));
    image.src = url;
  });
}

export async function renderRecyclatoriumCover(plan: RecyclatoriumPlan, assets: RecyclatoriumPdfAsset[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1275;
  canvas.height = 1650;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  ctx.fillStyle = "#FFFDF4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = plan.palette[0] || "#E27632";
  ctx.fillRect(0, 0, 44, canvas.height);
  ctx.globalAlpha = 0.16;
  ctx.beginPath(); ctx.arc(1120, 130, 210, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = plan.palette[1] || "#2B8A78";
  ctx.beginPath(); ctx.arc(1000, 250, 128, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = plan.palette[0] || "#E27632";
  ctx.font = "700 24px Inter, system-ui, sans-serif";
  ctx.fillText("RECYCLATORIUM ORIGINAL", 116, 138);
  ctx.fillStyle = "#222A31";
  ctx.font = "800 72px Inter, system-ui, sans-serif";
  const titleLines = canvasWrapLines(ctx, plan.title, 930).slice(0, 3);
  titleLines.forEach((line, index) => ctx.fillText(line, 116, 250 + index * 84));
  const titleBottom = 250 + titleLines.length * 84;
  ctx.fillStyle = "#59636A";
  ctx.font = "400 32px Inter, system-ui, sans-serif";
  canvasWrapLines(ctx, plan.subtitle, 900).slice(0, 3).forEach((line, index) => ctx.fillText(line, 116, titleBottom + 32 + index * 44));

  const imageAssets = assets.filter(asset => asset.previewUrl).slice(0, 3);
  const boxes = [
    { x: 116, y: 720, w: 500, h: 680 },
    { x: 656, y: 720, w: 475, h: 320 },
    { x: 656, y: 1080, w: 475, h: 320 },
  ];
  for (let index = 0; index < imageAssets.length; index += 1) {
    const image = await loadPreview(imageAssets[index].previewUrl!);
    const box = boxes[index];
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(box.x - 10, box.y - 10, box.w + 20, box.h + 20);
    const scale = Math.min(box.w / image.naturalWidth, box.h / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, box.x + (box.w - width) / 2, box.y + (box.h - height) / 2, width, height);
  }
  if (imageAssets.length === 0) {
    ctx.fillStyle = "#F2ECDD";
    ctx.fillRect(116, 720, 1015, 680);
  }

  ctx.fillStyle = plan.palette[0] || "#E27632";
  ctx.fillRect(116, 610, 340, 56);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 25px Inter, system-ui, sans-serif";
  ctx.fillText(plan.ageGrade, 142, 648);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Cover rendering failed")), "image/jpeg", 0.92);
  });
}

export function safeProductFilename(value: string) {
  return sanitizePdfText(value).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "recyclatorium-product";
}

export async function buildRecyclatoriumZip(
  plan: RecyclatoriumPlan,
  pdfBytes: Uint8Array,
  coverJpeg: Blob | Uint8Array,
  sourceNames: string[],
) {
  const zip = new JSZip();
  const baseName = safeProductFilename(plan.title);
  const generatedFiles = [
    `${baseName}.pdf`,
    `${baseName}-cover.jpg`,
    "teacher-guide.md",
    "listing-copy.md",
    "manifest.json",
    "SKU.json",
  ];

  zip.file(generatedFiles[0], pdfBytes);
  zip.file(generatedFiles[1], coverJpeg);
  zip.file("teacher-guide.md", [
    `# ${plan.title}`,
    "",
    `**Audience:** ${plan.ageGrade} · ${plan.customer}`,
    "",
    "## Teaching goals",
    ...plan.teachingGoals.map(goal => `- ${goal}`),
    "",
    "## Activity sequence",
    ...plan.activities.map((activity, index) => `${index + 1}. **${activity.title}** — ${activity.objective}`),
    "",
    "> Review source licenses before commercial distribution. The generated pack does not grant rights to third-party artwork.",
    "",
  ].join("\n"));
  zip.file("listing-copy.md", [
    `# ${plan.title}`,
    "",
    plan.listing.shortDescription,
    "",
    plan.listing.longDescription,
    "",
    `**Suggested price:** ${plan.listing.suggestedPrice}`,
    "",
    `**Tags:** ${plan.listing.tags.join(", ")}`,
    "",
  ].join("\n"));
  zip.file("manifest.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceAssetsUsedForInspiration: sourceNames,
    generatedFiles,
    originalUploadsIncluded: false,
    activityCount: plan.activities.length,
  }, null, 2));
  zip.file("SKU.json", JSON.stringify({
    title: plan.title,
    productType: plan.productType,
    theme: plan.theme,
    ageGrade: plan.ageGrade,
    suggestedPrice: plan.listing.suggestedPrice,
    tags: plan.listing.tags,
    source: "Quoratorium Recyclatorium",
  }, null, 2));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
}
