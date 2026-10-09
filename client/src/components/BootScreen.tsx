/**
 * Quoratorium — workspace startup screen
 * Uses the bundled app artwork and avoids animated SVG/filter glows that can
 * flicker on mobile GPUs.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BOOT_LINES = [
  "Initializing Quoratorium v3.0...",
  "Preparing your tools...",
  "Restoring your workspace...",
  "Checking your session...",
  "System ready.",
];

export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const [currentLine, setCurrentLine] = useState(0);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const lineInterval = setInterval(() => {
      setCurrentLine(previous => {
        if (previous >= BOOT_LINES.length - 1) {
          clearInterval(lineInterval);
          return previous;
        }
        return previous + 1;
      });
    }, 280);
    return () => clearInterval(lineInterval);
  }, []);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(previous => {
        if (previous >= 100) {
          clearInterval(progressInterval);
          setComplete(true);
          return 100;
        }
        return previous + 2;
      });
    }, 35);
    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    if (!complete) return;
    const timeout = setTimeout(onComplete, 400);
    return () => clearTimeout(timeout);
  }, [complete, onComplete]);

  return (
    <AnimatePresence>
      {!complete && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(ellipse at 50% 42%, rgba(54, 113, 255, 0.12) 0%, rgba(115, 78, 220, 0.08) 32%, #000000 72%)",
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="relative mb-8"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            <img
              src="/icon-512x512.png"
              alt="Quoratorium"
              className="relative z-10 h-36 w-36 rounded-[1.75rem] border border-blue-300/20 object-cover shadow-[0_0_42px_rgba(70,130,255,0.16),0_0_80px_rgba(141,92,246,0.11)]"
            />
          </motion.div>

          <div className="mb-6 text-center">
            <p className="font-display text-lg font-semibold tracking-[0.18em] text-foreground">
              QUORATORIUM
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Owner workspace
            </p>
          </div>

          <div className="mb-6 w-80 space-y-1 font-mono text-[10px]">
            {BOOT_LINES.slice(0, currentLine + 1).map((line, index) => (
              <motion.div
                key={line}
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <span
                  className={
                    index === currentLine && !complete
                      ? "text-primary"
                      : "text-primary/60"
                  }
                >
                  {index < currentLine || complete ? "✓" : "›"}
                </span>
                <span
                  className={
                    index === currentLine && !complete
                      ? "text-foreground/80"
                      : "text-muted-foreground/60"
                  }
                >
                  {line}
                </span>
              </motion.div>
            ))}
          </div>

          <div className="h-[2px] w-60 overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #5da8ff, #9674ff)",
                boxShadow: "0 0 10px rgba(103, 152, 255, 0.3)",
              }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <p className="mt-2 font-mono text-[9px] text-muted-foreground/40">
            {progress}%
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
