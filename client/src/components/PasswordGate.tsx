import { useState, useEffect } from "react";
import { QIdentity } from "@/components/QIdentity";

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
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className={`w-full max-w-sm mx-4 p-8 rounded-2xl bg-[#111118] border border-white/10 shadow-2xl ${shake ? "animate-shake" : ""}`}>
        <div className="flex flex-col items-center gap-4 mb-8">
          <QIdentity size={48} />
          <h1 className="text-xl font-bold text-white tracking-wide">QUORATORIUM</h1>
          <p className="text-sm text-white/40">Enter access code to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="Access code"
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 transition-colors text-center text-lg tracking-widest"
          />
          {error && (
            <p className="text-red-400 text-xs text-center">Invalid access code</p>
          )}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
