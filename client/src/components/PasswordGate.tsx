import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { HyperBlackQHero } from "./HyperBlackQ";
import { useAuth } from "@/_core/hooks/useAuth";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const hasClerkConfiguration = Boolean(publishableKey?.startsWith("pk_"));

export function PasswordGate({ children }: { children: React.ReactNode }) {
  if (!hasClerkConfiguration) {
    return <AuthenticationConfigurationRequired />;
  }

  return <ClerkAuthenticationGate>{children}</ClerkAuthenticationGate>;
}

function ClerkAuthenticationGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <AuthenticationLoading />;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <GateCard
      title="Sign in to your workspace"
      description="Use your Quoratorium account to continue to Toríu."
    >
      <div className="space-y-3">
        <SignInButton mode="redirect" forceRedirectUrl="/workspace">
          <button className="w-full py-3 rounded-xl bg-primary border border-primary text-white font-semibold tracking-wide transition-all duration-200 hover:bg-[#e87825] hover:border-[#f59a44] active:scale-[0.97]">
            Sign In
          </button>
        </SignInButton>
        <SignUpButton mode="redirect" forceRedirectUrl="/workspace">
          <button className="w-full py-3 rounded-xl border border-primary/30 text-primary font-semibold tracking-wide transition-colors hover:bg-primary/10">
            Create an Account
          </button>
        </SignUpButton>
      </div>
    </GateCard>
  );
}

function AuthenticationLoading() {
  return (
    <GateCard
      title="Checking your session"
      description="Verifying your secure Clerk session…"
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
      </div>
    </GateCard>
  );
}

function AuthenticationConfigurationRequired() {
  return (
    <GateCard
      title="Authentication configuration required"
      description="This workspace is unavailable until a Clerk publishable key is configured. No local password or browser-stored access bypass is available."
    >
      <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-center text-xs leading-relaxed text-amber-200/80">
        Set{" "}
        <code className="font-mono text-amber-100">
          VITE_CLERK_PUBLISHABLE_KEY
        </code>{" "}
        and configure the matching server-side Clerk secret before deploying
        this workspace.
      </p>
    </GateCard>
  );
}

function GateCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050302] px-4">
      <div
        className="w-full max-w-sm p-8 rounded-3xl bg-[#0b0704] border border-primary/20"
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
            <h2 className="mt-4 text-base font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              {description}
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
