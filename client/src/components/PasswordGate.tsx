import { useState } from "react";
import { HyperBlackQHero } from "./HyperBlackQ";
import { trpc } from "@/lib/trpc";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const status = trpc.auth.accessStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const unlock = trpc.auth.unlock.useMutation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  if (status.data?.authenticated) {
    return <>{children}</>;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim() || unlock.isPending) return;
    setError("");

    try {
      await unlock.mutateAsync({ code: password });
      await Promise.all([
        utils.auth.accessStatus.invalidate(),
        utils.auth.session.invalidate(),
        utils.auth.me.invalidate(),
      ]);
      await status.refetch();
      setPassword("");
    } catch (caught: any) {
      setError(caught?.message || "Access denied");
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      setPassword("");
    }
  };

  const loading = status.isLoading || status.isFetching;
  const configured = status.data?.configured !== false;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050302] px-4">
      <div
        className={`w-full max-w-sm p-8 rounded-3xl bg-[#0b0704] border border-primary/20 ${shake ? "animate-shake" : ""}`}
        style={{
          boxShadow:
            "0 0 70px rgba(216, 102, 24, 0.12), 0 24px 48px rgba(0, 0, 0, 0.8)",
        }}
      >
        <div className="flex flex-col items-center gap-4 mb-8">
          <HyperBlackQHero className="scale-75" />
          <div className="text-center">
            <h1 className="font-display text-xl font-bold text-white tracking-[0.12em]">
              QUORATORIUM
            </h1>
            <p className="mt-2 text-sm text-white/40">
              {loading
                ? "Verifying workspace access..."
                : "Enter your owner access code to meet Toríu."}
            </p>
          </div>
        </div>

        {!loading && !configured ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center text-sm text-amber-200/80">
            Server-side owner access is not configured. Set{" "}
            <code>OWNER_ACCESS_CODE</code> and{" "}
            <code>OWNER_ACCESS_SESSION_SECRET</code> in Railway.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={event => {
                setPassword(event.target.value);
                setError("");
              }}
              placeholder="Owner access code"
              autoFocus
              disabled={loading || unlock.isPending}
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-primary/15 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/60 transition-colors text-center text-lg tracking-widest disabled:opacity-50"
            />
            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || unlock.isPending || !password.trim()}
              className="w-full py-3 rounded-xl bg-primary border border-primary text-white font-semibold tracking-wide transition-all duration-200 hover:bg-[#e87825] hover:border-[#f59a44] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                boxShadow:
                  "0 0 18px rgba(216, 102, 24, 0.15), inset 0 0 12px rgba(216, 102, 24, 0.06)",
              }}
            >
              {unlock.isPending ? "Verifying..." : "Enter"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
