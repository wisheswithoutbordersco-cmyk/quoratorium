/**
 * CreditExhaustedBanner — shown inline in the chat when authenticated user's daily credits run out.
 * Directs them to the billing/upgrade page.
 */
import { motion } from "framer-motion";
import { Zap, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface CreditExhaustedBannerProps {
  plan: string;
  dailyLimit: number;
}

export function CreditExhaustedBanner({ plan, dailyLimit }: CreditExhaustedBannerProps) {
  return (
    <motion.div
      className="mx-3 my-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Zap size={16} className="text-amber-400" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-white mb-1">
            Daily credits exhausted
          </h4>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            You've used all {dailyLimit} credits for today on the <span className="text-amber-300 font-medium capitalize">{plan}</span> plan.
            Credits reset at midnight UTC.
          </p>
          <Link href="/workspace/settings">
            <motion.span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium cursor-pointer hover:bg-primary/15 transition-colors"
              whileTap={{ scale: 0.97 }}
            >
              Upgrade Plan
              <ArrowRight size={12} />
            </motion.span>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
