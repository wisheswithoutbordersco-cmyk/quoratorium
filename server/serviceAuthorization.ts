import { ENV, OWNER_EMAILS } from "./_core/env";
import { getUserById } from "./db";

/**
 * Shared environment credentials belong to the owner workspace. They must never
 * be used as a fallback for another authenticated account.
 */
export async function mayUseOwnerIntegrationCredentials(userId: number): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0) return false;

  const user = await getUserById(userId);
  if (!user) return false;

  if (ENV.ownerOpenId && user.clerk_id === ENV.ownerOpenId) return true;
  return Boolean(user.email && OWNER_EMAILS.includes(user.email.toLowerCase()));
}
