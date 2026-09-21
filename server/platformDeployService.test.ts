import { describe, expect, it, vi } from "vitest";

vi.mock("./services/email", () => ({
  sendBuildCompleteEmail: vi.fn(),
}));

import {
  deployToExternalPlatform,
  providerStatusToDeployStatus,
  toDeploymentDto,
} from "./platformDeployService";

describe("platform deployment state", () => {
  it("maps provider states to persisted deployment states", () => {
    expect(providerStatusToDeployStatus("vercel", "QUEUED")).toBe("queued");
    expect(providerStatusToDeployStatus("vercel", "BUILDING")).toBe("building");
    expect(providerStatusToDeployStatus("vercel", "READY")).toBe("live");
    expect(providerStatusToDeployStatus("vercel", "ERROR")).toBe("failed");
    expect(providerStatusToDeployStatus("netlify", "published")).toBe("live");
    expect(providerStatusToDeployStatus("netlify", "failed")).toBe("failed");
  });

  it("normalizes persisted deployment history fields for the client", () => {
    const dto = toDeploymentDto({
      id: 7,
      project_id: 9,
      user_id: 3,
      platform: "netlify",
      status: "building",
      url: null,
      deployment_id: "provider-deployment-123",
      project_name: "Saved project",
      branch: "main",
      commit_message: "Deploy saved files",
      logs: null,
      error: null,
      metadata: { source: "test" },
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    expect(dto).toMatchObject({
      projectId: 9,
      projectName: "Saved project",
      commitMessage: "Deploy saved files",
      providerDeploymentId: "provider-deployment-123",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(dto).not.toHaveProperty("project_name");
    expect(dto).not.toHaveProperty("commit_message");
  });

  it("rejects Railway before creating an empty provider project or service", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await deployToExternalPlatform({
      projectId: 1,
      userId: 1,
      platform: "railway",
      projectName: "Saved project",
      files: [{ filepath: "index.html", content: "<main>saved</main>" }],
    });

    expect(result).toEqual({
      success: false,
      status: "failed",
      error: "Railway source deployments are not supported yet. No Railway service was created.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
