import { useCallback } from "react";
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
  const utils = trpc.useUtils();
  const session = trpc.auth.session.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation();

  const user: AuthUser | null = session.data?.user
    ? {
        id: String(session.data.user.id),
        name: session.data.user.name || "Owner",
        email: session.data.user.email,
        avatar: null,
        role: session.data.user.role === "admin" ? "admin" : "user",
        created_at: 0,
      }
    : null;

  const refresh = useCallback(async () => {
    await session.refetch();
  }, [session]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    await Promise.all([
      utils.auth.session.invalidate(),
      utils.auth.accessStatus.invalidate(),
      utils.auth.me.invalidate(),
    ]);
    window.location.reload();
  }, [logoutMutation, utils.auth]);

  return {
    user,
    loading: session.isLoading || session.isFetching,
    error: session.error instanceof Error ? session.error : null,
    isAuthenticated: Boolean(session.data?.authenticated),
    refresh,
    logout,
    getToken: async (): Promise<string | null> => null,
  };
}
