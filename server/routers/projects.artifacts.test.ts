import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { createProjectZip, sanitizeProjectRelativePath } from "./projects";

describe("project artifact ZIP helpers", () => {
  it("creates a standards-compliant ZIP with preserved generated file contents", async () => {
    const archive = await createProjectZip([
      {
        id: 1,
        project_id: 1,
        user_id: 1,
        filename: "index.tsx",
        filepath: "src/index.tsx",
        content: "export const greeting = 'hello';\n",
        file_url: null,
        file_key: null,
        mime_type: "text/typescript",
        language: "tsx",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        project_id: 1,
        user_id: 1,
        filename: "README.md",
        filepath: "README.md",
        content: "# Project\n\nKeep this content exactly.\n",
        file_url: null,
        file_key: null,
        mime_type: "text/markdown",
        language: "markdown",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(archive.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");

    const zip = await JSZip.loadAsync(archive);
    await expect(zip.file("src/index.tsx")?.async("string")).resolves.toBe(
      "export const greeting = 'hello';\n",
    );
    await expect(zip.file("README.md")?.async("string")).resolves.toBe(
      "# Project\n\nKeep this content exactly.\n",
    );
  });

  it("normalizes unsafe persisted paths and keeps colliding files distinct", async () => {
    expect(sanitizeProjectRelativePath("../../etc/passwd", "fallback.txt")).toBe("etc/passwd");
    expect(sanitizeProjectRelativePath("/src\\components\\App.tsx", "fallback.txt")).toBe("src/components/App.tsx");

    const archive = await createProjectZip([
      {
        id: 1,
        project_id: 1,
        user_id: 1,
        filename: "app.ts",
        filepath: "../../app.ts",
        content: "first",
        file_url: null,
        file_key: null,
        mime_type: null,
        language: "typescript",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        project_id: 1,
        user_id: 1,
        filename: "app.ts",
        filepath: "app.ts",
        content: "second",
        file_url: null,
        file_key: null,
        mime_type: null,
        language: "typescript",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files).sort()).toEqual(["app (2).ts", "app.ts"]);
    await expect(zip.file("app.ts")?.async("string")).resolves.toBe("first");
    await expect(zip.file("app (2).ts")?.async("string")).resolves.toBe("second");
  });

  it("retrieves persisted external file bytes instead of creating an empty ZIP entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("external asset", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const archive = await createProjectZip([
        {
          id: 1,
          project_id: 1,
          user_id: 1,
          filename: "asset.txt",
          filepath: "assets/asset.txt",
          content: null,
          file_url: "https://storage.example/asset.txt",
          file_key: null,
          mime_type: "text/plain",
          language: "text",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const zip = await JSZip.loadAsync(archive);
      await expect(zip.file("assets/asset.txt")?.async("string")).resolves.toBe("external asset");
      expect(fetchMock).toHaveBeenCalledWith("https://storage.example/asset.txt");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
