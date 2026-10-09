import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseAdminMock, resolveAuthenticatedUserMock } = vi.hoisted(
  () => ({
    getSupabaseAdminMock: vi.fn(),
    resolveAuthenticatedUserMock: vi.fn(),
  })
);

vi.mock("./supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

vi.mock("./_core/context", async importOriginal => {
  const actual = await importOriginal<typeof import("./_core/context")>();
  return {
    ...actual,
    resolveAuthenticatedUser: resolveAuthenticatedUserMock,
  };
});

import { pwaIconRouter } from "./pwaIconRoute";

const owner = {
  id: 7,
  clerk_id: "owner",
  email: "wisheswithoutbordersco@gmail.com",
  role: "user",
} as any;
const nonOwnerAdmin = {
  id: 8,
  clerk_id: "another-admin",
  email: "admin@example.com",
  role: "admin",
} as any;

function saveIconHandler() {
  const route = (pwaIconRouter as any).stack.find(
    (layer: any) => layer.route?.path === "/api/settings/pwa-icon"
  )?.route;
  if (!route) throw new Error("PWA icon save route was not registered");
  return route.stack[0].handle as (req: any, res: any) => Promise<void>;
}

function response() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe("PWA icon owner access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn(() => ({
        upsert: vi.fn(async () => ({ error: null })),
      })),
    });
  });

  it("allows the verified owner even when their database role is not admin", async () => {
    resolveAuthenticatedUserMock.mockResolvedValue(owner);
    const res = response();

    await saveIconHandler()(
      { body: { icon: "data:image/png;base64,aGVsbG8=" } },
      res
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "PWA icon saved",
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects authenticated administrators who are not the owner", async () => {
    resolveAuthenticatedUserMock.mockResolvedValue(nonOwnerAdmin);
    const res = response();

    await saveIconHandler()(
      { body: { icon: "data:image/png;base64,aGVsbG8=" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Owner access required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    resolveAuthenticatedUserMock.mockResolvedValue(null);
    const res = response();

    await saveIconHandler()(
      { body: { icon: "data:image/png;base64,aGVsbG8=" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});
