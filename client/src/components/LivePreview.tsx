import { useState, useEffect, useRef, useCallback } from "react";
import { Monitor, Tablet, Smartphone, Maximize2, ExternalLink, X, Rocket } from "lucide-react";

interface LivePreviewProps {
  code: string;
  language?: string;
  isStreaming?: boolean;
  onClose?: () => void;
  onDeploy?: () => void;
}

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<Viewport, { width: string; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet: { width: "768px", label: "Tablet" },
  mobile: { width: "375px", label: "Mobile" },
};

/**
 * Wraps raw code in a full HTML document for iframe rendering.
 * Handles HTML, React/JSX (wraps in basic React scaffold), and plain CSS/JS.
 */
function buildSrcdoc(code: string, language?: string): string {
  // If it's already a full HTML document
  if (code.includes("<!DOCTYPE") || code.includes("<html")) {
    return code;
  }

  // If it contains HTML-like content (JSX or HTML fragments)
  if (code.includes("<div") || code.includes("<section") || code.includes("<main") || code.includes("<header")) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f23; color: #e2e8f0; }
  </style>
</head>
<body>
  ${code}
</body>
</html>`;
  }

  // If it's CSS
  if (language === "css" || code.includes("{") && code.includes("}") && code.includes(":")) {
    return `<!DOCTYPE html>
<html><head><style>${code}</style></head><body><div class="preview">CSS Preview</div></body></html>`;
  }

  // Default: wrap in pre tag
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: monospace; background: #1e1e2e; color: #cdd6f4; padding: 1rem; white-space: pre-wrap; }
  </style>
</head>
<body>${code}</body>
</html>`;
}

export function LivePreview({ code, language, isStreaming, onClose, onDeploy }: LivePreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [srcdoc, setSrcdoc] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced update during streaming (2 second delay)
  const updatePreview = useCallback((newCode: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcdoc(buildSrcdoc(newCode, language));
    }, isStreaming ? 2000 : 100);
  }, [language, isStreaming]);

  useEffect(() => {
    updatePreview(code);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, updatePreview]);

  const openInNewTab = () => {
    const blob = new Blob([srcdoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-slate-950 flex flex-col"
    : "relative flex flex-col h-full rounded-lg overflow-hidden border border-indigo-500/20 bg-slate-950/95";

  return (
    <div className={containerClass}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-500/20 bg-slate-900/80 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-indigo-300/70 mr-2">Preview</span>
          {isStreaming && (
            <span className="text-xs text-amber-400/80 animate-pulse">● updating</span>
          )}
        </div>

        {/* Viewport toggles */}
        <div className="flex items-center gap-1 bg-slate-800/60 rounded-md p-0.5">
          <button
            onClick={() => setViewport("desktop")}
            className={`p-1.5 rounded transition-all ${viewport === "desktop" ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-300"}`}
            title="Desktop"
          >
            <Monitor size={14} />
          </button>
          <button
            onClick={() => setViewport("tablet")}
            className={`p-1.5 rounded transition-all ${viewport === "tablet" ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-300"}`}
            title="Tablet"
          >
            <Tablet size={14} />
          </button>
          <button
            onClick={() => setViewport("mobile")}
            className={`p-1.5 rounded transition-all ${viewport === "mobile" ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-300"}`}
            title="Mobile"
          >
            <Smartphone size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {onDeploy && (
            <button
              onClick={onDeploy}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors"
              title="Deploy to platform"
            >
              <Rocket size={11} />
              <span className="text-[9px] font-medium">Deploy</span>
            </button>
          )}
          <button
            onClick={openInNewTab}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={14} />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
          </button>
          {onClose && !isFullscreen && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
              title="Close preview"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Iframe container */}
      <div className="flex-1 flex items-start justify-center overflow-auto bg-slate-900/50 p-2">
        <div
          className="h-full transition-all duration-300 ease-out bg-white rounded shadow-2xl overflow-hidden"
          style={{
            width: VIEWPORT_SIZES[viewport].width,
            maxWidth: "100%",
          }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
            title="Live Preview"
            style={{ minHeight: isFullscreen ? "calc(100vh - 48px)" : "300px" }}
          />
        </div>
      </div>
    </div>
  );
}
