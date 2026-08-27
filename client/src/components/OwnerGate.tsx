import { SignIn, useAuth as useClerkAuth, useClerk } from "@clerk/clerk-react";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 py-8 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#050505] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/q-logo.jpg"
            alt="Quoratorium"
            className="mb-3 h-auto w-[104px] select-none"
            draggable={false}
          />
          <h1 className="text-xl font-semibold tracking-wide">CAPTAIN Q</h1>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Private business workspace for Anthony Lane
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function OwnerGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const session = trpc.auth.session.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
    retry: false,
    refetchOnWindowFocus: true,
  });

  if (!isLoaded || (isSignedIn && session.isLoading)) {
    return (
      <GateShell>
        <div className="flex items-center justify-center gap-3 py-8 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-[#8b5cf6]" />
          Verifying owner session…
        </div>
      </GateShell>
    );
  }

  if (!isSignedIn) {
    return (
      <GateShell>
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#7c3aed]/25 bg-[#7c3aed]/[0.07] p-4">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#a78bfa]" />
          <p className="text-sm leading-6 text-white/65">
            Sign in with the owner account to open conversations, files, and confirmed business actions.
          </p>
        </div>
        <div className="flex justify-center overflow-hidden rounded-xl">
          <SignIn
            routing="hash"
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none",
                card: "w-full bg-transparent shadow-none border-0 p-0",
                headerTitle: "text-white",
                headerSubtitle: "text-white/50",
                socialButtonsBlockButton:
                  "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                formFieldInput:
                  "border-white/10 bg-white/[0.04] text-white",
                formButtonPrimary:
                  "bg-[#7c3aed] hover:bg-[#6d28d9] normal-case",
                footerActionText: "text-white/45",
                footerActionLink: "text-[#a78bfa]",
                dividerLine: "bg-white/10",
                dividerText: "text-white/35",
              },
            }}
          />
        </div>
      </GateShell>
    );
  }

  if (!session.data?.isVerifiedOwner) {
    return (
      <GateShell>
        <div className="space-y-4 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-amber-400" />
          <div>
            <h2 className="font-semibold">Owner account required</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              This signed-in account is not authorized to access Captain Q’s private business workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => clerk.signOut({ redirectUrl: "/" })}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium transition hover:bg-white/[0.08] active:scale-[0.97]"
          >
            Sign out
          </button>
        </div>
      </GateShell>
    );
  }

  return <>{children}</>;
}
