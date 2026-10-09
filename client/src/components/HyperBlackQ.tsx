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
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: getGlowGradient(state) }}
        aria-hidden="true"
      />
      {(state === "loading" || state === "thinking") && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: "1px solid rgba(127, 161, 255, 0.28)" }}
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
        <QGlassSVG size={size * 0.86} />
      </motion.div>
    </div>
  );
}

export function HyperBlackQSmall({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-flex select-none items-center justify-center ${className}`}
      style={{ width: 20, height: 20 }}
    >
      <QGlassSVG size={20} />
    </div>
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
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
    >
      <QGlassSVG size={size} />
    </motion.div>
  );
}

function QGlassSVG({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-face`} cx="36%" cy="28%" r="78%">
          <stop offset="0%" stopColor="rgba(36,44,68,0.8)" />
          <stop offset="55%" stopColor="rgba(12,15,26,0.94)" />
          <stop offset="100%" stopColor="rgba(4,4,8,0.99)" />
        </radialGradient>
        <radialGradient id={`${id}-sheen`} cx="26%" cy="18%" r="70%">
          <stop offset="0%" stopColor="rgba(117,169,255,0.2)" />
          <stop offset="62%" stopColor="rgba(150,116,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient
          id={`${id}-spectrum`}
          x1="12%"
          y1="5%"
          x2="90%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#8bd4ff" />
          <stop offset="48%" stopColor="#6798ff" />
          <stop offset="100%" stopColor="#b08aff" />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="47"
        fill="none"
        stroke={`url(#${id}-spectrum)`}
        strokeOpacity="0.78"
        strokeWidth="1.5"
      />
      <circle cx="50" cy="50" r="43" fill={`url(#${id}-face)`} />
      <circle cx="50" cy="50" r="42.5" fill={`url(#${id}-sheen)`} />
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke={`url(#${id}-spectrum)`}
        strokeOpacity="0.9"
        strokeWidth="7"
      />
      <path
        d="M62 62L79 79"
        stroke={`url(#${id}-spectrum)`}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M30 31C35 25 41 22 48 21"
        stroke="rgba(139, 198, 255, 0.75)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getGlowGradient(state: QState): string {
  if (state === "error") {
    return "radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, transparent 72%)";
  }
  return "radial-gradient(circle, rgba(87, 151, 255, 0.18) 0%, rgba(150, 116, 255, 0.1) 45%, transparent 74%)";
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
      return {
        rotate: [0, -12, 6, -3, 0],
        y: [0, 2, -1, 0],
        scale: [1, 0.92, 1.04, 1],
      };
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
      return {
        duration: 1.2,
        type: "spring" as const,
        stiffness: 100,
        damping: 15,
      };
    case "success":
      return { duration: 0.8, ease: "easeOut" as const };
  }
}
