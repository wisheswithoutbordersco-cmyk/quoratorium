import { useState } from "react";
import { HyperBlackQHero } from "./HyperBlackQ";

const STORAGE_KEY = "q-auth-token";
const VALID_HASH = "a1b2c3d4"; // Simple marker — real check is server-side

export function usePasswordGate() {
  const [authenticated, setAuthenticated] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === VALID_HASH;
  });

  const login = (password: string): boolean => {
    if (password === "Leelane99!") {
      localStorage.setItem(STORAGE_KEY, VALID_HASH);
      setAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthenticated(false);
  };

  return { authenticated, login, logout };
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const { authenticated, login } = usePasswordGate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  if (authenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(password);
    if (!success) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPassword("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050302] px-4">
      <div
        className={`w-full max-w-sm p-8 rounded-3xl bg-[#0b0704] border border-primary/20 ${shake ? "animate-shake" : ""}`}
        style={{ boxShadow: "0 0 70px rgba(216, 102, 24, 0.12), 0 24px 48px rgba(0, 0, 0, 0.8)" }}
      >
        <div className="flex flex-col items-center gap-4 mb-8">
          <HyperBlackQHero className="scale-75" />
          <div className="text-center">
            <h1 className="font-display text-xl font-bold text-white tracking-[0.12em]">QUORATORIUM</h1>
            <p className="mt-2 text-sm text-white/40">Enter your access code to meet Toríu.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Access code"
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-primary/15 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/60 transition-colors text-center text-lg tracking-widest"
          />
          {error && (
            <p className="text-red-400 text-xs text-center">Invalid access code</p>
          )}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-primary border border-primary text-white font-semibold tracking-wide transition-all duration-200 hover:bg-[#e87825] hover:border-[#f59a44] active:scale-[0.97]"
            style={{ boxShadow: "0 0 18px rgba(216, 102, 24, 0.15), inset 0 0 12px rgba(216, 102, 24, 0.06)" }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
