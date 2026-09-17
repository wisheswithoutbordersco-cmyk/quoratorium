import { motion } from "framer-motion";

interface ToriuAvatarProps {
  size?: number;
  active?: boolean;
  className?: string;
}

export function ToriuAvatar({ size = 28, active = false, className = "" }: ToriuAvatarProps) {
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label="Toríu"
      role="img"
    >
      <motion.div
        className="absolute inset-0 rounded-[34%] bg-[#d86618]/20 blur-[5px]"
        animate={active ? { opacity: [0.25, 0.7, 0.25], scale: [0.96, 1.08, 0.96] } : { opacity: 0.3, scale: 1 }}
        transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      />
      <svg viewBox="0 0 48 48" width={size} height={size} className="relative z-10 overflow-visible" fill="none">
        <defs>
          <linearGradient id="toriu-shell" x1="7" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#29211c" />
            <stop offset="0.55" stopColor="#0d0a08" />
            <stop offset="1" stopColor="#020201" />
          </linearGradient>
          <linearGradient id="toriu-ring" x1="8" y1="7" x2="39" y2="41" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffb15f" />
            <stop offset="0.45" stopColor="#de6b1b" />
            <stop offset="1" stopColor="#7c2b07" />
          </linearGradient>
          <filter id="toriu-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="3" y="4" width="42" height="40" rx="14" fill="url(#toriu-shell)" stroke="url(#toriu-ring)" strokeWidth="1.5" />
        <rect x="8" y="10" width="32" height="25" rx="10" fill="#030201" stroke="#402111" />
        <path d="M14 21c1.6-3 5-3 6.6 0" stroke="#ff8a2b" strokeWidth="2.5" strokeLinecap="round" filter="url(#toriu-glow)" />
        <path d="M27.4 21c1.6-3 5-3 6.6 0" stroke="#ff8a2b" strokeWidth="2.5" strokeLinecap="round" filter="url(#toriu-glow)" />
        <path d="M17 27.5c4.2 4 9.8 4 14 0" stroke="#ff8a2b" strokeWidth="2.5" strokeLinecap="round" filter="url(#toriu-glow)" />
        <rect x="18" y="38" width="12" height="3" rx="1.5" fill="#d86618" opacity="0.7" />
      </svg>
    </div>
  );
}
