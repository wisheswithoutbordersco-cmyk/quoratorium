/**
 * Workspace Preview Panel — Live preview iframe for generated code
 * 
 * Renders HTML/CSS/JS in a sandboxed iframe using srcdoc.
 * Hyper-black glass aesthetic with subtle dark gray borders.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  X,
  Rocket,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import { useUIStore } from "@/stores";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<Viewport, { width: string; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet: { width: "768px", label: "Tablet" },
  mobile: { width: "375px", label: "Mobile" },
};

/**
 * Wraps raw code in a full HTML document for iframe rendering.
 */
function buildSrcdoc(code: string): string {
  // Already a full HTML document
  if (code.includes("<!DOCTYPE") || code.includes("<html")) {
    return code;
  }

  // Contains HTML-like content (JSX fragments, HTML elements)
  if (
    code.includes("<div") ||
    code.includes("<section") ||
    code.includes("<main") ||
    code.includes("<header") ||
    code.includes("<nav") ||
    code.includes("<form") ||
    code.includes("<button")
  ) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ffffff; color: #1a1a2e; min-height: 100vh; }
  </style>
</head>
<body>
  ${code}
</body>
</html>`;
  }

  // Contains React/TSX component code — render as code display
  if (code.includes("export") || code.includes("import") || code.includes("function") || code.includes("const")) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'JetBrains Mono', 'Fira Code', monospace; background: #0a0a0a; color: #e2e8f0; padding: 1.5rem; line-height: 1.6; }
    pre { white-space: pre-wrap; word-wrap: break-word; font-size: 13px; }
    .comment { color: #6b7280; }
    .keyword { color: #93c5fd; }
    .string { color: #86efac; }
    .function { color: #c4b5fd; }
  </style>
</head>
<body>
  <pre>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`;
  }

  // Default: raw content
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; background: #ffffff; color: #1a1a2e; padding: 2rem; }
  </style>
</head>
<body>${code}</body>
</html>`;
}

export function WorkspacePreviewPanel() {
  const { previewCode, previewFileName, closePreview } = useUIStore();
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [srcdoc, setSrcdoc] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced update — prevents excessive iframe reloads during streaming
  useEffect(() => {
    if (!previewCode) {
      setSrcdoc("");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcdoc(buildSrcdoc(previewCode));
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [previewCode]);

  const openInNewTab = useCallback(() => {
    if (!srcdoc) return;
    const blob = new Blob([srcdoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [srcdoc]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  if (!previewCode) return null;

  // Mobile: full-screen overlay
  if (isFullscreen) {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex flex-col bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Fullscreen toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/40 font-mono truncate max-w-[200px]">
              {previewFileName || "preview.html"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="p-1.5 text-white/30 hover:text-white/70 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={openInNewTab}
              className="p-1.5 text-white/30 hover:text-white/70 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={14} />
            </button>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 text-white/30 hover:text-white/70 transition-colors"
              title="Exit fullscreen"
            >
              <Minimize2 size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1">
          <iframe
            key={refreshKey}
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
            title="Live Preview"
          />
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-black shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="text-[10px] text-white/30 font-medium tracking-wider uppercase">
              Preview
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono truncate max-w-[120px]">
            {previewFileName || "preview.html"}
          </span>
        </div>

        {/* Viewport toggles */}
        <div className="flex items-center gap-0.5 bg-white/[0.02] border border-white/5 rounded-sm p-0.5">
          {(["desktop", "tablet", "mobile"] as Viewport[]).map((vp) => (
            <button
              key={vp}
              onClick={() => setViewport(vp)}
              className={`p-1 rounded-sm transition-all ${
                viewport === vp
                  ? "bg-white/10 text-white/70"
                  : "text-white/20 hover:text-white/40"
              }`}
              title={VIEWPORT_SIZES[vp].label}
            >
              {vp === "desktop" && <Monitor size={12} />}
              {vp === "tablet" && <Tablet size={12} />}
              {vp === "mobile" && <Smartphone size={12} />}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {}}
            className="flex items-center gap-1 px-2 py-1 rounded-sm bg-white/[0.03] border border-white/5 text-white/30 hover:text-white/60 hover:border-white/10 transition-all"
            title="Deploy (coming soon)"
          >
            <Rocket size={10} />
            <span className="text-[9px] font-medium">Deploy</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 text-white/20 hover:text-white/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={openInNewTab}
            className="p-1.5 text-white/20 hover:text-white/50 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 text-white/20 hover:text-white/50 transition-colors"
            title="Fullscreen"
          >
            <Maximize2 size={12} />
          </button>
          <button
            onClick={closePreview}
            className="p-1.5 text-white/20 hover:text-red-400/60 transition-colors"
            title="Close preview"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Iframe container */}
      <div className="flex-1 flex items-start justify-center overflow-auto p-2 bg-[#050505]">
        <div
          className="h-full transition-all duration-300 ease-out rounded-sm overflow-hidden border border-white/5"
          style={{
            width: VIEWPORT_SIZES[viewport].width,
            maxWidth: "100%",
            background: "#ffffff",
          }}
        >
          <iframe
            key={refreshKey}
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
            title="Live Preview"
            style={{ minHeight: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile Preview Overlay — full-screen overlay with close button
 */
export function MobilePreviewOverlay() {
  const { previewCode, previewFileName, closePreview } = useUIStore();
  const [srcdoc, setSrcdoc] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!previewCode) {
      setSrcdoc("");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSrcdoc(buildSrcdoc(previewCode));
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [previewCode]);

  if (!previewCode) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black shrink-0">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-white/30" />
          <span className="text-[11px] text-white/40 font-mono truncate max-w-[180px]">
            {previewFileName || "preview.html"}
          </span>
        </div>
        <button
          onClick={closePreview}
          className="p-2 rounded-sm text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <X size={16} />
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 overflow-hidden">
        <iframe
          srcDoc={srcdoc}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
          title="Live Preview"
        />
      </div>
    </motion.div>
  );
}
