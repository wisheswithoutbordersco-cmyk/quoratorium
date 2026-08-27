import {
  useAuth as useClerkAuth,
  useClerk,
  useUser,
} from "@clerk/clerk-react";

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  role: "admin" | "user";
  created_at: number;
};

export function useAuth(_options?: { redirectOnUnauthenticated?: boolean }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user } = useUser();
  const clerk = useClerk();

  const normalizedUser: AuthUser | null = user
    ? {
        id: user.id,
        name: user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "Owner",
        email: user.primaryEmailAddress?.emailAddress || null,
        avatar: user.imageUrl || null,
        role: user.publicMetadata?.role === "admin" ? "admin" : "user",
        created_at: user.createdAt?.getTime() || Date.now(),
      }
    : null;

  return {
    user: normalizedUser,
    loading: !isLoaded,
    error: null as Error | null,
    isAuthenticated: Boolean(isSignedIn),
    refresh: async () => {
      await user?.reload();
    },
    logout: async () => {
      await clerk.signOut({ redirectUrl: "/" });
    },
    getToken,
  };
}
