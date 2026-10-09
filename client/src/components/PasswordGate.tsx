import { useState } from "react";
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
    <div className="min-h-screen flex items-center justify-center bg-black px-4 py-8">
      <div
        className={`relative w-full max-w-md rounded-[1.75rem] border border-primary/20 bg-white/[0.035] p-7 backdrop-blur-2xl sm:p-10 ${shake ? "animate-shake" : ""}`}
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 80px rgba(0,0,0,0.72), 0 0 54px rgba(79,135,255,0.08), 0 0 72px rgba(150,116,255,0.06)",
        }}
      >
        <div className="flex flex-col items-center gap-4 mb-8">
          <img
            src="/icon-512x512.png"
            alt="Quoratorium"
            className="h-40 w-40 rounded-[2rem] border border-primary/20 object-cover shadow-[0_0_36px_rgba(79,135,255,0.14),0_0_54px_rgba(150,116,255,0.1)]"
          />
          <div className="text-center">
            <h1 className="font-display text-xl font-bold text-white tracking-[0.12em]">
              QUORATORIUM
            </h1>
            <p className="mt-2 text-sm text-white/40">
              {loading
                ? "Verifying workspace access..."
                : "Enter your owner access code to open your workspace."}
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
              className="w-full rounded-xl border border-primary/20 bg-white/[0.035] px-4 py-4 text-center text-lg tracking-widest text-white placeholder:text-white/35 transition-colors focus:border-violet-400/55 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
            />
            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || unlock.isPending || !password.trim()}
              className="w-full rounded-xl border border-blue-300/25 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600 py-3.5 font-semibold tracking-wide text-white transition-all duration-200 hover:border-violet-300/45 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.28)",
              }}
            >
              {unlock.isPending ? "Verifying..." : "Open workspace"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
