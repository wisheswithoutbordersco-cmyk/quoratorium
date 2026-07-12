/**
 * GuestCreditsIndicator — shows remaining free messages for guests.
 * Displayed above the chat input area.
 */
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { GUEST_MESSAGE_LIMIT } from "@/hooks/useGuestLimit";

interface GuestCreditsIndicatorProps {
  remaining: number;
}

export function GuestCreditsIndicator({ remaining }: GuestCreditsIndicatorProps) {
  if (remaining >= GUEST_MESSAGE_LIMIT) return null; // Don't show until they've used at least one

  const urgency = remaining <= 1 ? "text-red-400" : remaining <= 2 ? "text-amber-400" : "text-primary/60";

  return (
    <motion.div
      className="flex items-center justify-center gap-1.5 py-1.5 text-[10px]"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.2 }}
    >
      <MessageCircle size={10} className={urgency} />
      <span className={`${urgency} font-medium`}>
        {remaining} free {remaining === 1 ? "message" : "messages"} remaining
      </span>
    </motion.div>
  );
}
