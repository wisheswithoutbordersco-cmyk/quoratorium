import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addOrchestrationEvent } = vi.hoisted(() => ({
  addOrchestrationEvent: vi.fn(async () => 1),
}));

vi.mock("./db", () => ({ addOrchestrationEvent }));

import {
  getRepositoryTree,
  readRepositoryFile,
  searchRepositoryCode,
} from "./githubService";
import { getActionCatalog, isCapabilityEnabled } from "./actionCatalog";

describe("GitHub read-only capability", () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-read-only-token";
    fetchMock.mockReset();
    addOrchestrationEvent.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it("lists a repository tree using only GitHub GET requests and records an audit event", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          full_name: "owner/repository",
          default_branch: "main",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          truncated: false,
          tree: [
            { path: "client", type: "tree", sha: "tree-sha" },
            {
              path: "client/src/App.tsx",
              type: "blob",
              size: 420,
              sha: "file-sha",
            },
          ],
        }),
      });

    const tree = await getRepositoryTree(7, "owner/repository", undefined, 2);

    expect(tree).toMatchObject({
      repository: "owner/repository",
      reference: "main",
      truncated: false,
    });
    expect(tree.entries).toEqual([
      { path: "client", type: "directory", size: null, sha: "tree-sha" },
      { path: "client/src/App.tsx", type: "file", size: 420, sha: "file-sha" },
    ]);
    expect(fetchMock.mock.calls.map(call => call[1]?.method || "GET")).toEqual([
      "GET",
      "GET",
    ]);
    expect(addOrchestrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "github_read",
        summary: "repository_tree · owner/repository",
        payload: expect.objectContaining({
          capability: "github.repository.read",
          permission: "read",
        }),
      })
    );
  });

  it("reads a repository file without creating or changing a GitHub resource", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        type: "file",
        name: "App.tsx",
        path: "client/src/App.tsx",
        sha: "file-sha",
        size: 22,
        content: Buffer.from("export default App;\n", "utf8").toString(
          "base64"
        ),
      }),
    });

    const file = await readRepositoryFile(
      7,
      "owner/repository",
      "client/src/App.tsx",
      "main"
    );

    expect(file.content).toBe("export default App;\n");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method || "GET").toBe("GET");
    expect(addOrchestrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "repository_file_read · owner/repository",
        payload: expect.objectContaining({ path: "client/src/App.tsx" }),
      })
    );
  });

  it("searches code using GitHub GET and rejects malformed repository input", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 1,
        items: [
          {
            path: "server/routers/git.ts",
            name: "git.ts",
            sha: "abc",
            html_url:
              "https://github.com/owner/repository/blob/main/server/routers/git.ts",
          },
        ],
      }),
    });

    const search = await searchRepositoryCode(
      7,
      "owner/repository",
      "gitRouter"
    );
    expect(search.results[0]?.path).toBe("server/routers/git.ts");
    expect(fetchMock.mock.calls[0][1]?.method || "GET").toBe("GET");

    await expect(getRepositoryTree(7, "not a repository")).rejects.toThrow(
      "owner/repository format"
    );
  });

  it("contains no enabled merge capability", () => {
    const catalog = getActionCatalog("GitHub");
    const merge = catalog.find(capability => capability.id === "github.merge");

    expect(merge).toMatchObject({
      status: "disabled",
      confirmation: "disabled",
    });
    expect(isCapabilityEnabled("github.merge")).toBe(false);
    expect(isCapabilityEnabled("github.repository.read")).toBe(true);
  });
});
