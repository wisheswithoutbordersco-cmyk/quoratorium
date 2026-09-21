/**
 * Application authentication adapter.
 *
 * Clerk is the source of session state and tokens. The server-side session
 * query supplies the application role, which remains authoritative for API
 * authorization. Do not replace this with browser storage or a local secret.
 */
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  role: "admin" | "user";
  created_at: number;
};

export function useAuth(_options?: { redirectOnUnauthenticated?: boolean }) {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    getToken,
    signOut,
  } = useClerkAuth();
  const { isLoaded: isUserLoaded, user: clerkUser } = useUser();
  const sessionQuery = trpc.auth.session.useQuery(undefined, {
    enabled: isAuthLoaded && Boolean(isSignedIn),
    retry: false,
    staleTime: 60_000,
  });

  const user = useMemo<AuthUser | null>(() => {
    if (!isSignedIn || !clerkUser) return null;

    const verifiedUser = sessionQuery.data?.user;
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
    const name = clerkUser.fullName || clerkUser.username || email || "User";

    return {
      id: verifiedUser ? String(verifiedUser.id) : clerkUser.id,
      name,
      email,
      avatar: clerkUser.imageUrl ?? null,
      // The API-provided role is authoritative. Until it arrives, default to
      // the least-privileged UI role; server procedures enforce this again.
      role: verifiedUser?.role === "admin" ? "admin" : "user",
      created_at: clerkUser.createdAt?.getTime() ?? Date.now(),
    };
  }, [clerkUser, isSignedIn, sessionQuery.data?.user]);

  const refresh = useCallback(async () => {
    await getToken({ skipCache: true });
    await sessionQuery.refetch();
  }, [getToken, sessionQuery]);

  const logout = useCallback(async () => {
    await signOut({ redirectUrl: "/" });
  }, [signOut]);

  return {
    user,
    loading:
      !isAuthLoaded ||
      !isUserLoaded ||
      (Boolean(isSignedIn) && sessionQuery.isLoading),
    error: sessionQuery.error instanceof Error ? sessionQuery.error : null,
    isAuthenticated: Boolean(isSignedIn),
    refresh,
    logout,
    getToken,
  };
}
