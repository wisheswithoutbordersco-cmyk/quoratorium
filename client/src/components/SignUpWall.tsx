/**
 * SignUpWall — shown when guest message limit is reached.
 * On-brand Matrix/cinematic dark UI.
 */
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Shield, Brain, Sparkles } from "lucide-react";
import { QIdentity } from "@/components/QIdentity";

interface SignUpWallProps {
  open: boolean;
  onClose: () => void;
  messagesUsed: number;
}

export function SignUpWall({ open, onClose, messagesUsed }: SignUpWallProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-primary/20 bg-gradient-to-b from-[#0a1a0a] to-[#050d05] shadow-2xl shadow-primary/5 overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
            
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all z-10"
            >
              <X size={16} />
            </button>

            {/* Content */}
            <div className="relative px-8 pt-10 pb-8 text-center">
              {/* Q Identity */}
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <QIdentity size={48} />
                  <motion.div
                    className="absolute -inset-3 rounded-full border border-primary/20"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </div>
              </div>

              {/* Headline */}
              <h2 className="text-xl font-semibold text-white mb-2 tracking-tight">
                You've unlocked Captain Q's potential
              </h2>
              <p className="text-sm text-white/50 mb-6 leading-relaxed">
                You've used {messagesUsed} free messages. Create a free account to continue
                building with AI-powered orchestration.
              </p>

              {/* Features */}
              <div className="grid grid-cols-2 gap-3 mb-8 text-left">
                <FeatureItem icon={<Zap size={14} />} text="25 credits/day" />
                <FeatureItem icon={<Brain size={14} />} text="AI workers" />
                <FeatureItem icon={<Shield size={14} />} text="Project vault" />
                <FeatureItem icon={<Sparkles size={14} />} text="Memory & context" />
              </div>

              {/* CTA Buttons */}
              <motion.button
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm
                  shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed"
                whileTap={{ scale: 0.97 }}
                disabled
                title="Sign-up available once authentication is configured"
              >
                Create Free Account
                <span className="block text-[10px] opacity-60 mt-0.5">Coming soon — DNS propagating</span>
              </motion.button>

              <p className="text-[10px] text-white/25 mt-4">
                No credit card required. Upgrade anytime for more credits.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
      <span className="text-primary/70">{icon}</span>
      <span className="text-[11px] text-white/60">{text}</span>
    </div>
  );
}
