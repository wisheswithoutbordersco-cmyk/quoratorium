import { useId } from "react";
import { motion } from "framer-motion";

export type QState = "idle" | "thinking" | "loading" | "error" | "success";

interface HyperBlackQProps {
  size?: number;
  state?: QState;
  className?: string;
}

export function HyperBlackQ({
  size = 32,
  state = "idle",
  className = "",
}: HyperBlackQProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: getGlowGradient(state) }}
        animate={getGlowAnimation(state)}
        transition={getGlowTransition(state)}
        aria-hidden="true"
      />
      {(state === "loading" || state === "thinking") && (
        <motion.div
          className="absolute inset-0 rounded-full border border-white/20"
          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
          transition={{
            duration: state === "loading" ? 1.5 : 2,
            repeat: Infinity,
            ease: "easeOut",
          }}
          aria-hidden="true"
        />
      )}
      <motion.div
        className="relative z-10"
        style={{ width: size * 0.86, height: size * 0.86 }}
        animate={getQAnimation(state)}
        transition={getQTransition(state)}
      >
        <QGlassSVG size={size * 0.86} state={state} />
      </motion.div>
    </div>
  );
}

export function HyperBlackQSmall({ className = "" }: { className?: string }) {
  return (
    <motion.div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ width: 20, height: 20 }}
      animate={{
        filter: [
          "drop-shadow(0 0 3px rgba(255,255,255,0.16))",
          "drop-shadow(0 0 8px rgba(255,255,255,0.3))",
          "drop-shadow(0 0 3px rgba(255,255,255,0.16))",
        ],
      }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <QGlassSVG size={20} state="idle" />
    </motion.div>
  );
}

export function HyperBlackQHero({
  className = "",
  size = 176,
}: {
  className?: string;
  size?: number;
}) {
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
            "drop-shadow(0 0 18px rgba(255,255,255,0.1)) drop-shadow(0 0 52px rgba(255,255,255,0.035))",
            "drop-shadow(0 0 28px rgba(255,255,255,0.2)) drop-shadow(0 0 72px rgba(255,255,255,0.06))",
            "drop-shadow(0 0 18px rgba(255,255,255,0.1)) drop-shadow(0 0 52px rgba(255,255,255,0.035))",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <QGlassSVG size={size} state="idle" />
      </motion.div>
    </motion.div>
  );
}

function QGlassSVG({ size, state }: { size: number; state: QState }) {
  const id = useId().replace(/:/g, "");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: getSVGFilter(state), display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-face`} cx="36%" cy="28%" r="78%">
          <stop offset="0%" stopColor="rgba(44,46,51,0.72)" />
          <stop offset="55%" stopColor="rgba(17,18,21,0.92)" />
          <stop offset="100%" stopColor="rgba(4,4,5,0.98)" />
        </radialGradient>
        <radialGradient id={`${id}-sheen`} cx="26%" cy="18%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient id={`${id}-silver`} x1="12%" y1="5%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.88)" />
          <stop offset="52%" stopColor="rgba(211,215,224,0.48)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.76)" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="47" fill="none" stroke={`url(#${id}-silver)`} strokeOpacity="0.6" strokeWidth="1.4" />
      <circle cx="50" cy="50" r="43" fill={`url(#${id}-face)`} />
      <circle cx="50" cy="50" r="42.5" fill={`url(#${id}-sheen)`} />
      <circle cx="50" cy="50" r="30" fill="none" stroke={`url(#${id}-silver)`} strokeOpacity="0.75" strokeWidth="7" />
      <path d="M62 62L79 79" stroke={`url(#${id}-silver)`} strokeWidth="7" strokeLinecap="round" />
      <path d="M30 31C35 25 41 22 48 21" stroke="rgba(255,255,255,0.46)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function getSVGFilter(state: QState): string {
  switch (state) {
    case "error":
      return "drop-shadow(0 0 6px rgba(239,68,68,0.25))";
    case "thinking":
    case "loading":
      return "drop-shadow(0 0 8px rgba(255,255,255,0.22))";
    case "success":
      return "drop-shadow(0 0 10px rgba(255,255,255,0.28))";
    default:
      return "drop-shadow(0 0 4px rgba(255,255,255,0.13))";
  }
}

function getGlowGradient(state: QState): string {
  if (state === "error") {
    return "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)";
  }
  return "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)";
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
