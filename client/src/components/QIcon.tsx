/**
 * Q Workspace — Animated Q Icon V2
 * Design: Obsidian Command — Living AI Identity
 * 
 * Enhanced behavior:
 * - Slow rotation with multi-phase stumble
 * - Glow dims during stumble, bursts on recovery
 * - Reactive to system state (thinking, processing, idle)
 * - Ambient particle emission during active states
 * - Smooth transitions between states
 */
import { motion } from "framer-motion";

interface QIconProps {
  size?: number;
  isThinking?: boolean;
  isProcessing?: boolean;
  className?: string;
}

export function QIcon({ size = 40, isThinking = false, isProcessing = false, className = "" }: QIconProps) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size + 16, height: size + 16 }}>
      {/* Outer ambient glow - breathes slowly */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.78 0.12 85 / 0.12) 0%, transparent 70%)",
        }}
        animate={
          isThinking
            ? { scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }
            : isProcessing
            ? { scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }
            : { scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }
        }
        transition={{
          duration: isThinking ? 1 : isProcessing ? 1.5 : 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Secondary ring pulse (thinking/processing) */}
      {(isThinking || isProcessing) && (
        <motion.div
          className="absolute inset-0 rounded-full border border-[oklch(0.78_0.12_85/0.15)]"
          animate={{
            scale: [1, 1.8],
            opacity: [0.3, 0],
          }}
          transition={{
            duration: isThinking ? 1.2 : 2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      )}

      {/* Tertiary ring (thinking only - double pulse) */}
      {isThinking && (
        <motion.div
          className="absolute inset-0 rounded-full border border-[oklch(0.78_0.12_85/0.1)]"
          animate={{
            scale: [1, 2.2],
            opacity: [0.2, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: 0.4,
          }}
        />
      )}

      {/* Main Q letter with stumble animation */}
      <motion.div
        className="relative flex items-center justify-center font-display font-bold select-none"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          color: "oklch(0.78 0.12 85)",
          textShadow: `0 0 ${isThinking ? "28px" : isProcessing ? "20px" : "14px"} oklch(0.78 0.12 85 / ${isThinking ? "0.8" : isProcessing ? "0.5" : "0.35"})`,
        }}
        animate={
          isThinking
            ? { rotate: [0, 360] }
            : {
                // Multi-phase rotation with stumble at ~55%
                rotate: [0, 8, 15, 22, 30, 55, 48, 40, 55, 80, 360],
                // Dims during stumble, brightens on recovery
                opacity: [1, 1, 1, 0.9, 0.7, 0.45, 0.5, 0.7, 0.9, 1, 1],
                // Scale dip during stumble, slight bounce on recovery
                scale: [1, 1, 1, 0.98, 0.93, 0.88, 0.91, 0.97, 1.04, 1.01, 1],
              }
        }
        transition={
          isThinking
            ? { duration: 1.5, repeat: Infinity, ease: "linear" }
            : {
                duration: 12,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.06, 0.12, 0.2, 0.35, 0.52, 0.58, 0.65, 0.75, 0.88, 1],
              }
        }
      >
        Q
      </motion.div>

      {/* Recovery flash (subtle) */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, oklch(0.85 0.14 85 / 0.2) 0%, transparent 50%)",
        }}
        animate={
          isThinking
            ? { opacity: 0 }
            : { opacity: [0, 0, 0, 0, 0, 0, 0, 0.6, 0.3, 0, 0] }
        }
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.72, 0.8, 0.9, 1],
        }}
      />
    </div>
  );
}

export function QIconSmall({ className = "" }: { className?: string }) {
  return (
    <motion.span
      className={`font-display font-bold text-base select-none ${className}`}
      style={{
        color: "oklch(0.78 0.12 85)",
        textShadow: "0 0 10px oklch(0.78 0.12 85 / 0.5)",
      }}
      animate={{
        opacity: [0.85, 1, 0.85],
        textShadow: [
          "0 0 10px oklch(0.78 0.12 85 / 0.3)",
          "0 0 14px oklch(0.78 0.12 85 / 0.6)",
          "0 0 10px oklch(0.78 0.12 85 / 0.3)",
        ],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      Q
    </motion.span>
  );
}

export function QIconLarge({ isThinking = false }: { isThinking?: boolean }) {
  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      {/* Large ambient glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.78 0.12 85 / 0.1) 0%, transparent 60%)",
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* The Q */}
      <motion.span
        className="font-display font-bold text-5xl select-none"
        style={{
          color: "oklch(0.78 0.12 85)",
          textShadow: "0 0 30px oklch(0.78 0.12 85 / 0.5), 0 0 60px oklch(0.78 0.12 85 / 0.2)",
        }}
        animate={
          isThinking
            ? { rotate: [0, 360], scale: [1, 1.05, 1] }
            : {
                rotate: [0, 5, 0, -3, 15, 10, 0, 360],
                opacity: [1, 1, 1, 1, 0.5, 0.7, 1, 1],
                scale: [1, 1, 1, 1, 0.9, 0.95, 1.02, 1],
              }
        }
        transition={
          isThinking
            ? { duration: 2, repeat: Infinity, ease: "linear" }
            : { duration: 12, repeat: Infinity, ease: "easeInOut", times: [0, 0.1, 0.2, 0.4, 0.55, 0.65, 0.8, 1] }
        }
      >
        Q
      </motion.span>
    </div>
  );
}
