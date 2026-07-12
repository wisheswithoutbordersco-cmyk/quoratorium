/**
 * Quoratorium — Cinematic Boot Screen
 * Displays a system-boot animation while the app loads
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HyperBlackQHero } from "./HyperBlackQ";

const BOOT_LINES = [
  "Initializing Quoratorium v3.0...",
  "Loading neural orchestration engine...",
  "Connecting to DeepSeek (Builder)...",
  "Connecting to Gemini (Validator)...",
  "Connecting to OpenRouter (Router)...",
  "Calibrating Captain Q routing...",
  "System ready.",
];



export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const [currentLine, setCurrentLine] = useState(0);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const lineInterval = setInterval(() => {
      setCurrentLine((prev) => {
        if (prev >= BOOT_LINES.length - 1) {
          clearInterval(lineInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 280);
    return () => clearInterval(lineInterval);
  }, []);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setComplete(true);
          return 100;
        }
        return prev + 2;
      });
    }, 35);
    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    if (complete) {
      const timeout = setTimeout(onComplete, 400);
      return () => clearTimeout(timeout);
    }
  }, [complete, onComplete]);

  return (
    <AnimatePresence>
      {!complete && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ backgroundColor: "#000000" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Ambient glow — hyper-dark, barely visible */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)",
              }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          {/* Q Emblem — hyper-black glass */}
          <motion.div
            className="relative mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            {/* Subtle ambient glow — dark, no green */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              style={{ filter: "blur(24px)" }}
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div
                className="w-24 h-24 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)",
                }}
              />
            </motion.div>
            <HyperBlackQHero className="relative z-10" />
          </motion.div>

          {/* Boot text */}
          <div className="w-80 font-mono text-[10px] space-y-1 mb-6">
            {BOOT_LINES.slice(0, currentLine + 1).map((line, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <span className={i === currentLine && !complete ? "text-emerald-400" : "text-emerald-500"}>
                  {i < currentLine || complete ? "✓" : "›"}
                </span>
                <span className={i === currentLine && !complete ? "text-foreground/80" : "text-muted-foreground/60"}>
                  {line}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="w-60 h-[2px] bg-border rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #16a34a, #22c55e)",
                boxShadow: "0 0 8px rgba(34,197,94,0.5)",
              }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <p className="text-[9px] text-muted-foreground/40 mt-2 font-mono">{progress}%</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
