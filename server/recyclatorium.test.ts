import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { parseRecyclatoriumPlan } from "./routers/recyclatorium";
import {
  buildRecyclatoriumPdf,
  buildRecyclatoriumZip,
  readableSourceName,
  safeProductFilename,
  sanitizePdfText,
} from "../client/src/lib/recyclatoriumPdf";
import type { RecyclatoriumPlan } from "../shared/recyclatorium";
import {
  enforceRecyclatoriumRateLimit,
  RECYCLATORIUM_RATE_LIMIT,
  resetRecyclatoriumRateLimitsForTests,
  validateRecyclatoriumAssets,
} from "./recyclatoriumService";

const plan: RecyclatoriumPlan = {
  title: "World Cultures Discovery Pack",
  subtitle: "Observe, compare, describe, and create with visual culture clues.",
  theme: "World cultures",
  ageGrade: "Grades 1-3",
  productType: "Visual literacy activity pack",
  customer: "Elementary teachers and families",
  visualSummary:
    "The sources show illustrated country covers with children, landmarks, plants, animals, and regional design details.",
  whyTogether:
    "The shared day-in-the-life structure supports careful observation, respectful comparison, vocabulary, and creative response activities.",
  teachingGoals: [
    "Notice visual details",
    "Build descriptive vocabulary",
    "Compare places respectfully",
  ],
  palette: ["#E27632", "#2B8A78", "#F2C14E"],
  activities: Array.from({ length: 4 }, (_, index) => ({
    title: `Visual Detective ${index + 1}`,
    instructions:
      "Study the source spark and circle details that reveal place, weather, food, clothing, or landscape.",
    objective: "Use visible evidence to make and explain an observation.",
    sourceAsset: `source-${index + 1}.png`,
    vocabulary: ["observe", "detail", "place"],
    prompt:
      "I notice ______. This detail makes me think ______ because ______.",
    extension:
      "Draw one new detail that would fit the setting and explain your choice.",
  })),
  listing: {
    shortDescription:
      "A printable visual-literacy pack for exploring world cultures.",
    longDescription:
      "Students use illustrated country scenes to observe, compare, write, and create through four original classroom activities.",
    tags: [
      "world cultures",
      "visual literacy",
      "social studies",
      "elementary",
      "printable",
    ],
    suggestedPrice: "$5.99",
  },
};

describe("Recyclatorium product generation", () => {
  it("parses a strict product plan and rejects non-JSON fallback text", () => {
    expect(parseRecyclatoriumPlan(JSON.stringify(plan))).toEqual(plan);
    expect(() =>
      parseRecyclatoriumPlan("Falling back to filename heuristics")
    ).toThrow(/malformed JSON/i);
  });

  it("builds a genuinely new multi-page printable instead of a one-page wrapper", async () => {
    const bytes = await buildRecyclatoriumPdf(plan, []);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(7);
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("packages generated deliverables without copying source uploads", async () => {
    const pdfBytes = await buildRecyclatoriumPdf(plan, []);
    const archiveBlob = await buildRecyclatoriumZip(
      plan,
      pdfBytes,
      new Uint8Array([255, 216, 255, 217]),
      plan.activities.map(activity => activity.sourceAsset)
    );
    const archive = await JSZip.loadAsync(await archiveBlob.arrayBuffer());
    const names = Object.keys(archive.files).sort();

    expect(names).toEqual([
      "SKU.json",
      "World-Cultures-Discovery-Pack-cover.jpg",
      "World-Cultures-Discovery-Pack.pdf",
      "listing-copy.md",
      "manifest.json",
      "teacher-guide.md",
    ]);
    expect(names.some(name => name.startsWith("source-"))).toBe(false);
    const manifest = JSON.parse(
      await archive.file("manifest.json")!.async("string")
    );
    expect(manifest.originalUploadsIncluded).toBe(false);
    expect(manifest.activityCount).toBe(4);
  });

  it("keeps exported filenames and PDF text portable", () => {
    expect(safeProductFilename("World Cultures — PreK–3!")).toBe(
      "World-Cultures-PreK-3"
    );
    expect(sanitizePdfText("It’s a “new” pack…")).toBe('It\'s a "new" pack...');
    expect(
      readableSourceName(
        "220a32ed-f633-4e80-a3dd-cc4b11edf86c4284312017593918808.jpg"
      )
    ).toBe("Uploaded source artwork");
  });

  it("accepts only declared, supported media whose bytes match the MIME type", () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;

    expect(
      validateRecyclatoriumAssets({
        mode: "transform",
        assets: [{ name: "source.png", mimeType: "image/png", dataUrl }],
      }).assets[0]
    ).toEqual({ name: "source.png", mimeType: "image/png", dataUrl });

    expect(() =>
      validateRecyclatoriumAssets({
        mode: "transform",
        assets: [{ name: "source.jpg", mimeType: "image/jpeg", dataUrl }],
      })
    ).toThrow(/valid image\/jpeg data URL/i);

    const fakePng = `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`;
    expect(() =>
      validateRecyclatoriumAssets({
        mode: "invent",
        assets: [{ name: "fake.png", mimeType: "image/png", dataUrl: fakePng }],
      })
    ).toThrow(/content does not match image\/png/i);
  });

  it("enforces the owner-scoped analysis rate limit", () => {
    resetRecyclatoriumRateLimitsForTests();
    for (let index = 0; index < RECYCLATORIUM_RATE_LIMIT; index += 1) {
      enforceRecyclatoriumRateLimit(77, 1000 + index);
    }
    expect(() => enforceRecyclatoriumRateLimit(77, 2000)).toThrow(
      /six analyses/i
    );
    expect(() => enforceRecyclatoriumRateLimit(78, 2000)).not.toThrow();
    resetRecyclatoriumRateLimitsForTests();
  });
});
