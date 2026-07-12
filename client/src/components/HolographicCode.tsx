import { useState, useEffect, useRef } from "react";

interface HolographicCodeProps {
  code: string;
  language?: string;
  isStreaming?: boolean;
  onComplete?: () => void;
}

// Simple syntax highlighting tokens
function tokenize(line: string, language: string): Array<{ text: string; type: string }> {
  const tokens: Array<{ text: string; type: string }> = [];
  const keywords = new Set([
    "const", "let", "var", "function", "return", "if", "else", "for", "while",
    "import", "export", "from", "default", "class", "extends", "new", "this",
    "async", "await", "try", "catch", "throw", "typeof", "interface", "type",
    "enum", "implements", "public", "private", "protected", "static", "readonly",
    "def", "self", "print", "True", "False", "None", "lambda", "with", "as",
    "div", "span", "p", "h1", "h2", "h3", "section", "main", "header",
  ]);

  const parts = line.split(/(\s+|[{}()[\];,.<>:=+\-*/&|!?@#$%^~`"'])/);
  for (const part of parts) {
    if (!part) continue;
    if (keywords.has(part)) {
      tokens.push({ text: part, type: "keyword" });
    } else if (/^["'`]/.test(part)) {
      tokens.push({ text: part, type: "string" });
    } else if (/^\d+/.test(part)) {
      tokens.push({ text: part, type: "number" });
    } else if (/^\/\/|^#/.test(part)) {
      tokens.push({ text: part, type: "comment" });
    } else if (/^[{}()[\];,.<>:=+\-*/&|!?@#$%^~`]$/.test(part)) {
      tokens.push({ text: part, type: "punctuation" });
    } else {
      tokens.push({ text: part, type: "text" });
    }
  }
  return tokens;
}

function getTokenColor(type: string): string {
  switch (type) {
    case "keyword": return "#c792ea";
    case "string": return "#c3e88d";
    case "number": return "#f78c6c";
    case "comment": return "#546e7a";
    case "punctuation": return "#89ddff";
    default: return "#cdd6f4";
  }
}

export function HolographicCode({ code, language = "typescript", isStreaming = false, onComplete }: HolographicCodeProps) {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [completedLines, setCompletedLines] = useState<Set<number>>(new Set());
  const [isLocked, setIsLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = code.split("\n");

  // Progressive line reveal during streaming
  useEffect(() => {
    if (isStreaming) {
      setVisibleLines(lines.length);
    } else {
      // When not streaming, show all lines immediately
      setVisibleLines(lines.length);
    }
  }, [lines.length, isStreaming]);

  // Mark lines as "materialized" with staggered timing
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    for (let i = 0; i < visibleLines; i++) {
      if (!completedLines.has(i)) {
        const timer = setTimeout(() => {
          setCompletedLines((prev) => new Set([...Array.from(prev), i]));
        }, i * 80 + 300);
        timers.push(timer);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [visibleLines]);

  // Lock-in effect when streaming completes
  useEffect(() => {
    if (!isStreaming && code.length > 0 && visibleLines === lines.length) {
      const timer = setTimeout(() => {
        setIsLocked(true);
        onComplete?.();
      }, lines.length * 80 + 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, code, visibleLines, lines.length]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-hidden font-mono text-sm"
      style={{
        background: "linear-gradient(135deg, rgba(15, 15, 35, 0.95), rgba(20, 20, 50, 0.95))",
        border: "1px solid rgba(99, 102, 241, 0.2)",
        boxShadow: isLocked
          ? "0 0 20px rgba(99, 102, 241, 0.1)"
          : "0 0 30px rgba(99, 102, 241, 0.15), inset 0 0 30px rgba(99, 102, 241, 0.05)",
        transition: "box-shadow 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-indigo-500/20 bg-indigo-950/30">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-indigo-300/60 ml-2">{language}</span>
        {isStreaming && (
          <span className="ml-auto text-xs text-indigo-400/80 animate-pulse">
            ● materializing
          </span>
        )}
        {isLocked && (
          <span className="ml-auto text-xs text-green-400/80">
            ✓ locked
          </span>
        )}
      </div>

      {/* Code content */}
      <div className="p-4 overflow-x-auto">
        {lines.slice(0, visibleLines).map((line, lineIdx) => {
          const isMaterialized = completedLines.has(lineIdx);
          const tokens = tokenize(line, language);

          return (
            <div
              key={lineIdx}
              className="flex items-center"
              style={{
                opacity: isMaterialized ? 1 : 0.4,
                transform: isMaterialized ? "translateX(0)" : "translateX(-4px)",
                transition: `all 0.4s cubic-bezier(0.23, 1, 0.32, 1) ${lineIdx * 30}ms`,
              }}
            >
              {/* Line number */}
              <span className="inline-block w-8 text-right mr-4 text-xs text-slate-600 select-none shrink-0">
                {lineIdx + 1}
              </span>

              {/* Code tokens with holographic effect */}
              <span className="relative">
                {tokens.map((token, tokenIdx) => (
                  <span
                    key={tokenIdx}
                    style={{
                      color: getTokenColor(token.type),
                      textShadow: !isMaterialized
                        ? `0 0 8px ${getTokenColor(token.type)}80`
                        : token.type === "keyword"
                        ? `0 0 3px ${getTokenColor(token.type)}40`
                        : "none",
                      transition: "text-shadow 0.6s ease",
                    }}
                  >
                    {token.text}
                  </span>
                ))}

                {/* Shimmer sweep overlay for materializing lines */}
                {!isMaterialized && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: "linear-gradient(90deg, transparent 0%, rgba(99, 102, 241, 0.15) 50%, transparent 100%)",
                      animation: "shimmerSweep 1.5s ease-in-out infinite",
                      animationDelay: `${lineIdx * 100}ms`,
                    }}
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Lock-in flash overlay */}
      {isLocked && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, rgba(99, 102, 241, 0.05) 0%, transparent 100%)",
            animation: "lockFlash 0.6s ease-out forwards",
          }}
        />
      )}

      <style>{`
        @keyframes shimmerSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes lockFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
