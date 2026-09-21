import { describe, expect, it } from "vitest";
import type { TrpcContext } from "../_core/context";
import { gitRouter } from "./git";

type User = NonNullable<TrpcContext["user"]>;

const fallbackOwner: User = {
  id: 1,
  openId: "owner-fallback",
  email: "owner@example.com",
  name: "Owner",
  loginMethod: "owner_bypass",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function fallbackContext(): TrpcContext {
  return {
    user: fallbackOwner,
    authenticatedUser: null,
    isOwner: true,
    isVerifiedOwner: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

async function expectUnauthorized(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "UNAUTHORIZED" });
}

describe("GitHub strict authentication boundary", () => {
  it("rejects owner-fallback contexts for status, audit, reads, connect, and disconnect", async () => {
    const caller = gitRouter.createCaller(fallbackContext());

    await expectUnauthorized(caller.status());
    await expectUnauthorized(caller.auditLog({ limit: 20 }));
    await expectUnauthorized(caller.listRepos({ limit: 20 }));
    await expectUnauthorized(
      caller.connect({
        token: "github_pat_not_sent_anywhere",
        repositories: ["example/repo"],
      })
    );
    await expectUnauthorized(caller.disconnect());
  });
});
