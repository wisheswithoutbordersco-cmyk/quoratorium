/**
 * useGuestLimit — guest message tracking.
 *
 * UNLIMITED MODE: The cap has been removed. All users (guests and owners)
 * get unlimited messages. Any stale localStorage data from the old 5-message
 * limit is cleared on load to prevent false "limit reached" states.
 *
 * To re-enable limits in the future, restore GUEST_LIMIT to a real number
 * and remove the UNLIMITED_MODE flag.
 */

const STORAGE_KEY = "q_guest_messages";
const OWNER_FLAG_KEY = "q_is_owner";
const UNLIMITED_MODE = true; // Set to false to re-enable limits

// Clear any stale localStorage state from the old 5-message limit
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
} catch { /* ignore */ }

/** Set the owner flag in localStorage (kept for backward compat) */
export function setOwnerFlag(_isOwner: boolean): void {
  try {
    if (_isOwner) {
      localStorage.setItem(OWNER_FLAG_KEY, "true");
    } else {
      localStorage.removeItem(OWNER_FLAG_KEY);
    }
  } catch { /* ignore */ }
}

export function getGuestMessagesRemaining(): number {
  return 999999; // unlimited
}

export function getGuestMessagesUsed(): number {
  return 0;
}

export function incrementGuestMessages(): number {
  return 999999; // unlimited, nothing to track
}

export function isGuestLimitReached(): boolean {
  return false; // never limited
}

export const GUEST_MESSAGE_LIMIT = UNLIMITED_MODE ? 999999 : 5;
