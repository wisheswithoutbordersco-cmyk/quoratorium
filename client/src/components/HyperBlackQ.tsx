/**
 * HyperBlackQ — Hyper-black glass Q emblem
 *
 * Pure dark aesthetic: barely-there depth, subtle glass refraction,
 * dark-on-dark. No green, no matrix code, no colorful accents.
 * Replaces the old matrix-code Q logo across all three locations:
 *   1. Landing page nav + hero
 *   2. Boot/splash screen
 *   3. Workspace top-left nav
 */
import { motion } from "framer-motion";

export type QState = "idle" | "thinking" | "loading" | "error" | "success";

interface HyperBlackQProps {
  size?: number;
  state?: QState;
  className?: string;
}

/**
 * Full animated Q emblem with state-aware glow.
 * Drop-in replacement for QIdentity.
 */
export function HyperBlackQ({ size = 32, state = "idle", className = "" }: HyperBlackQProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Subtle ambient glow — state-aware, always near-black */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: getGlowGradient(state) }}
        animate={getGlowAnimation(state)}
        transition={getGlowTransition(state)}
      />

      {/* Expanding ring for active states */}
      {(state === "loading" || state === "thinking") && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
          transition={{
            duration: state === "loading" ? 1.5 : 2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      )}

      {/* The Q SVG */}
      <motion.div
        className="relative z-10"
        style={{ width: size * 0.8, height: size * 0.8 }}
        animate={getQAnimation(state)}
        transition={getQTransition(state)}
      >
        <QGlassSVG size={size * 0.8} state={state} />
      </motion.div>
    </div>
  );
}

/**
 * Small inline variant for nav — minimal, no animation ring.
 * Drop-in replacement for QIdentitySmall.
 */
export function HyperBlackQSmall({ className = "" }: { className?: string }) {
  return (
    <motion.div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ width: 20, height: 20 }}
      animate={{
        filter: [
          "drop-shadow(0 0 3px rgba(255,255,255,0.06))",
          "drop-shadow(0 0 6px rgba(255,255,255,0.12))",
          "drop-shadow(0 0 3px rgba(255,255,255,0.06))",
        ],
      }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <QGlassSVG size={20} state="idle" />
    </motion.div>
  );
}

/**
 * Static large emblem for hero/splash — no framer-motion wrapper,
 * accepts a custom className for sizing and positioning.
 */
export function HyperBlackQHero({ className = "" }: { className?: string }) {
  return (
    <motion.div
      className={`inline-flex items-center justify-center ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.div
        animate={{
          filter: [
            "drop-shadow(0 0 20px rgba(255,255,255,0.04)) drop-shadow(0 0 60px rgba(255,255,255,0.02))",
            "drop-shadow(0 0 30px rgba(255,255,255,0.08)) drop-shadow(0 0 80px rgba(255,255,255,0.04))",
            "drop-shadow(0 0 20px rgba(255,255,255,0.04)) drop-shadow(0 0 60px rgba(255,255,255,0.02))",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <QGlassSVG size={160} state="idle" />
      </motion.div>
    </motion.div>
  );
}

// ─── Core SVG ────────────────────────────────────────────────────────────────

function QGlassSVG({ size, state }: { size: number; state: QState }) {
  const id = `q-glass-${Math.round(size)}`;
  const filter = getSVGFilter(state);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter, display: "block" }}
    >
      <defs>
        {/* Radial gradient for the face — dark center, barely lighter edge */}
        <radialGradient id={`${id}-face`} cx="42%" cy="38%" r="60%">
          <stop offset="0%" stopColor="rgba(28,28,28,0.95)" />
          <stop offset="60%" stopColor="rgba(14,14,14,0.98)" />
          <stop offset="100%" stopColor="rgba(6,6,6,1)" />
        </radialGradient>

        {/* Glass sheen — top-left highlight */}
        <radialGradient id={`${id}-sheen`} cx="30%" cy="25%" r="45%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>

        {/* Outer ring gradient */}
        <linearGradient id={`${id}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.10)" />
        </linearGradient>

        {/* Inner ring — barely visible */}
        <linearGradient id={`${id}-inner`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
        </linearGradient>

        {/* Tail gradient */}
        <linearGradient id={`${id}-tail`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
        </linearGradient>
      </defs>

      {/* Outer ring */}
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={`url(#${id}-ring)`}
        strokeWidth="1.5"
      />

      {/* Main Q body — filled circle */}
      <circle
        cx="50"
        cy="50"
        r="43"
        fill={`url(#${id}-face)`}
      />

      {/* Inner ring — inset border */}
      <circle
        cx="50"
        cy="50"
        r="43"
        fill="none"
        stroke={`url(#${id}-inner)`}
        strokeWidth="0.8"
      />

      {/* Glass sheen overlay */}
      <circle
        cx="50"
        cy="50"
        r="43"
        fill={`url(#${id}-sheen)`}
      />

      {/* The Q letterform — cut-out style */}
      {/* Outer Q arc (the ring of the letter) */}
      <path
        d="M50 22
           C34.5 22 22 34.5 22 50
           C22 65.5 34.5 78 50 78
           C65.5 78 78 65.5 78 50
           C78 34.5 65.5 22 50 22Z
           M50 30
           C61 30 70 39 70 50
           C70 61 61 70 50 70
           C39 70 30 61 30 50
           C30 39 39 30 50 30Z"
        fill="rgba(255,255,255,0.055)"
      />

      {/* Q tail — the distinctive diagonal stroke */}
      <line
        x1="62"
        y1="62"
        x2="76"
        y2="78"
        stroke={`url(#${id}-tail)`}
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Q tail cap — small rounded end */}
      <circle
        cx="76"
        cy="78"
        r="2.5"
        fill="rgba(255,255,255,0.14)"
      />

      {/* Top-left micro-highlight — glass refraction */}
      <path
        d="M32 30 Q38 24 46 26"
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── State helpers ────────────────────────────────────────────────────────────

function getSVGFilter(state: QState): string {
  switch (state) {
    case "idle":
      return "drop-shadow(0 0 4px rgba(255,255,255,0.06))";
    case "thinking":
      return "drop-shadow(0 0 8px rgba(255,255,255,0.12))";
    case "loading":
      return "drop-shadow(0 0 6px rgba(255,255,255,0.10))";
    case "error":
      return "drop-shadow(0 0 6px rgba(239,68,68,0.20))";
    case "success":
      return "drop-shadow(0 0 10px rgba(255,255,255,0.16))";
  }
}

function getGlowGradient(state: QState): string {
  switch (state) {
    case "error":
      return "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)";
    case "success":
      return "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)";
    default:
      return "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)";
  }
}

function getGlowAnimation(state: QState) {
  switch (state) {
    case "idle":
      return { scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] };
    case "thinking":
      return { scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] };
    case "loading":
      return { scale: [1, 1.25, 1], opacity: [0.4, 0.8, 0.4] };
    case "error":
      return { scale: [1, 0.9, 1.05, 1], opacity: [0.3, 0.5, 0.2, 0.3] };
    case "success":
      return { scale: [1, 1.4, 1], opacity: [0.4, 0.8, 0.3] };
  }
}

function getGlowTransition(state: QState) {
  switch (state) {
    case "idle":
      return { duration: 4, repeat: Infinity, ease: "easeInOut" as const };
    case "thinking":
      return { duration: 2, repeat: Infinity, ease: "easeInOut" as const };
    case "loading":
      return { duration: 1.5, repeat: Infinity, ease: "linear" as const };
    case "error":
      return { duration: 1.2, ease: [0.4, 0, 0.6, 1] as [number, number, number, number] };
    case "success":
      return { duration: 0.8, ease: "easeOut" as const };
  }
}

function getQAnimation(state: QState) {
  switch (state) {
    case "idle":
      return { rotate: 0, scale: 1, y: 0 };
    case "thinking":
      return { rotate: [0, 360], scale: [1, 1.02, 1] };
    case "loading":
      return { rotate: [0, 360] };
    case "error":
      return { rotate: [0, -12, 6, -3, 0], y: [0, 2, -1, 0], scale: [1, 0.92, 1.04, 1] };
    case "success":
      return { rotate: 0, scale: [1, 1.12, 1], y: [0, -2, 0] };
  }
}

function getQTransition(state: QState) {
  switch (state) {
    case "idle":
      return { duration: 0.3 };
    case "thinking":
      return { duration: 2, repeat: Infinity, ease: "linear" as const };
    case "loading":
      return { duration: 1.5, repeat: Infinity, ease: "linear" as const };
    case "error":
      return { duration: 1.2, type: "spring" as const, stiffness: 100, damping: 15 };
    case "success":
      return { duration: 0.8, ease: "easeOut" as const };
  }
}
