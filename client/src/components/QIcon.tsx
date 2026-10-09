import { HyperBlackQ, HyperBlackQHero, HyperBlackQSmall } from "./HyperBlackQ";

interface QIconProps {
  size?: number;
  isThinking?: boolean;
  isProcessing?: boolean;
  className?: string;
}

export function QIcon({
  size = 40,
  isThinking = false,
  isProcessing = false,
  className = "",
}: QIconProps) {
  const state = isThinking ? "thinking" : isProcessing ? "loading" : "idle";
  return <HyperBlackQ size={size} state={state} className={className} />;
}

export function QIconSmall({ className = "" }: { className?: string }) {
  return <HyperBlackQSmall className={className} />;
}

export function QIconLarge({ isThinking = false }: { isThinking?: boolean }) {
  return (
    <HyperBlackQHero size={96} className={isThinking ? "animate-pulse" : ""} />
  );
}
