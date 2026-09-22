import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { User } from "../db";

const mocks = vi.hoisted(() => ({
  getUserOrchestrationEvents: vi.fn(),
  getPriorityServiceStatuses: vi.fn(),
}));

vi.mock("../db", () => mocks);
vi.mock("../prioritySuiteService", () => ({
  getPriorityServiceStatuses: mocks.getPriorityServiceStatuses,
}));

import { actionsRouter } from "./actions";

const owner: User = {
  id: 1,
  clerk_id: "owner_workspace",
  name: "Owner",
  email: null,
  login_method: "owner_access",
  role: "admin",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  last_signed_in: new Date(0).toISOString(),
};

function caller(authenticated = true) {
  const ctx: TrpcContext = {
    req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
    user: authenticated ? owner : null,
    isOwner: authenticated,
    authenticatedUser: authenticated ? owner : null,
    isVerifiedOwner: authenticated,
  };
  return actionsRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPriorityServiceStatuses.mockResolvedValue([
    {
      system: "Extractorium",
      configured: true,
      connected: true,
      message: "Authenticated service connection is available.",
    },
    {
      system: "Templatorium",
      configured: true,
      connected: true,
      message: "Authenticated service connection is available.",
    },
  ]);
  mocks.getUserOrchestrationEvents.mockResolvedValue([
    {
      id: 11,
      project_id: null,
      user_id: 1,
      event_type: "github_read",
      agent_name: "Toríu · GitHub",
      summary: "read · owner/repository",
      payload: {
        capability: "github.repository.read",
        repository: "owner/repository",
        accessToken: "must-not-leak",
        rawContent: "must-not-leak",
      },
      created_at: "2026-09-21T20:00:00.000Z",
    },
    {
      id: 12,
      project_id: null,
      user_id: 1,
      event_type: "captain_response",
      agent_name: "Toríu",
      summary: "ordinary chat",
      payload: null,
      created_at: "2026-09-21T20:01:00.000Z",
    },
  ]);
});

describe("Action Catalog router", () => {
  it("requires an authenticated workspace session", async () => {
    await expect(caller(false).catalog()).rejects.toThrow();
    await expect(caller(false).serviceStatus()).rejects.toThrow();
    await expect(caller(false).audit({ limit: 10 })).rejects.toThrow();
  });

  it("returns the enforced GitHub and Recyclatorium policies", async () => {
    const catalog = await caller().catalog();
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "github.repository.read",
          status: "enabled",
        }),
        expect.objectContaining({ id: "github.merge", status: "disabled" }),
        expect.objectContaining({
          id: "recyclatorium.product_plan.propose",
          status: "enabled",
        }),
        expect.objectContaining({
          id: "extractorium.document.read",
          status: "enabled",
        }),
        expect.objectContaining({
          id: "templatorium.text_regions.read",
          status: "enabled",
        }),
      ])
    );
  });

  it("returns live authenticated service status", async () => {
    await expect(caller().serviceStatus()).resolves.toEqual([
      expect.objectContaining({ system: "Extractorium", connected: true }),
      expect.objectContaining({ system: "Templatorium", connected: true }),
    ]);
  });

  it("returns only capability events and strips unapproved payload fields", async () => {
    const audit = await caller().audit({ limit: 10 });
    expect(mocks.getUserOrchestrationEvents).toHaveBeenCalledWith(1, 10);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventType: "github_read",
      payload: {
        capability: "github.repository.read",
        repository: "owner/repository",
      },
    });
    expect(audit[0].payload).not.toHaveProperty("accessToken");
    expect(audit[0].payload).not.toHaveProperty("rawContent");
  });
});
