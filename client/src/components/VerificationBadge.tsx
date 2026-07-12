/**
 * Verification Badge — Subtle confidence indicator after assistant messages
 * Part of Patent 2: Synthesis Verification
 */

interface VerificationBadgeProps {
  badge: {
    score: number;
    label: string;
    verified: boolean;
  };
}

export function VerificationBadge({ badge }: VerificationBadgeProps) {
  if (!badge || !badge.label) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full transition-opacity ${
        badge.verified
          ? "bg-emerald-400/10 text-emerald-400/70"
          : "bg-amber-400/10 text-amber-400/70"
      }`}
      title={`Consensus: ${badge.score}% across multiple AI models`}
    >
      {badge.label}
    </span>
  );
}
