/**
 * useAuth — stub implementation while Clerk DNS propagates.
 * Returns a stable constant object — no hooks, no re-renders.
 * TODO: Restore Clerk integration once clerk.quoratorium.com CNAME resolves.
 */

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  role: "admin" | "user";
  created_at: number;
};

// Stable constant references — never recreated, never cause re-renders
const NOOP_ASYNC = async () => {};
const NOOP_REFRESH = () => Promise.resolve();
const GET_TOKEN = async (): Promise<string | null> => null;

const STUB_STATE = {
  user: null as AuthUser | null,
  loading: false,
  error: null as Error | null,
  isAuthenticated: false,
  refresh: NOOP_REFRESH,
  logout: NOOP_ASYNC,
  getToken: GET_TOKEN,
} as const;

export function useAuth(_options?: { redirectOnUnauthenticated?: boolean }) {
  return STUB_STATE;
}
