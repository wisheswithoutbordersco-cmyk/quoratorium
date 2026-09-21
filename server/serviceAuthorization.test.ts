import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "./db";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
}));

import { getUserById } from "./db";
import { mayUseOwnerIntegrationCredentials } from "./serviceAuthorization";

function user(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    clerk_id: "user_123",
    name: "User",
    email: "user@example.com",
    login_method: "clerk",
    role: "user",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    last_signed_in: new Date(0).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OWNER_OPEN_ID;
});

describe("shared integration credential authorization", () => {
  it("allows the configured owner email", async () => {
    vi.mocked(getUserById).mockResolvedValue(user({
      email: "wisheswithoutbordersco@gmail.com",
    }));
    await expect(mayUseOwnerIntegrationCredentials(1)).resolves.toBe(true);
  });

  it("rejects a different authenticated user", async () => {
    vi.mocked(getUserById).mockResolvedValue(user());
    await expect(mayUseOwnerIntegrationCredentials(1)).resolves.toBe(false);
  });

  it("rejects missing and invalid user identities", async () => {
    vi.mocked(getUserById).mockResolvedValue(undefined);
    await expect(mayUseOwnerIntegrationCredentials(1)).resolves.toBe(false);
    await expect(mayUseOwnerIntegrationCredentials(0)).resolves.toBe(false);
  });
});
