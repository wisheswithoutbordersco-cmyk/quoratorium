/**
 * Public Shared Project Page
 * Renders a shared project without authentication.
 * Shows project name, description, code with syntax highlighting, and live preview.
 */
import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Code2, Eye, FileCode, Layers, ExternalLink, Copy, Check } from "lucide-react";

// Simple syntax highlighting with token coloring
function SyntaxHighlighter({ code, language }: { code: string; language: string }) {
  const highlighted = useMemo(() => {
    const lines = code.split("\n");
    return lines.map((line, i) => (
      <div key={i} className="flex">
        <span className="inline-block w-10 text-right pr-3 text-[11px] text-white/20 select-none shrink-0">
          {i + 1}
        </span>
        <span className="text-[13px] leading-relaxed whitespace-pre font-mono">
          {highlightLine(line, language)}
        </span>
      </div>
    ));
  }, [code, language]);

  return (
    <div className="overflow-x-auto p-4 text-sm font-mono">
      {highlighted}
    </div>
  );
}

function highlightLine(line: string, language: string) {
  // Simple keyword-based highlighting
  const keywords = ["import", "export", "from", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "interface", "type", "async", "await", "default", "new", "this", "extends", "implements", "try", "catch", "throw", "switch", "case", "break", "continue", "true", "false", "null", "undefined", "void", "typeof", "instanceof"];
  const jsxKeywords = ["div", "span", "button", "input", "form", "h1", "h2", "h3", "p", "a", "img", "ul", "li", "section", "header", "footer", "nav", "main"];

  // Simple tokenization
  const parts: { text: string; type: string }[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Comments
    if (remaining.startsWith("//")) {
      parts.push({ text: remaining, type: "comment" });
      remaining = "";
    }
    // Strings
    else if (remaining[0] === '"' || remaining[0] === "'" || remaining[0] === "`") {
      const quote = remaining[0];
      let end = 1;
      while (end < remaining.length && remaining[end] !== quote) {
        if (remaining[end] === "\\") end++;
        end++;
      }
      end++;
      parts.push({ text: remaining.slice(0, end), type: "string" });
      remaining = remaining.slice(end);
    }
    // Numbers
    else if (/^\d/.test(remaining)) {
      const match = remaining.match(/^\d+\.?\d*/);
      if (match) {
        parts.push({ text: match[0], type: "number" });
        remaining = remaining.slice(match[0].length);
      }
    }
    // Words
    else if (/^[a-zA-Z_$]/.test(remaining)) {
      const match = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
      if (match) {
        const word = match[0];
        if (keywords.includes(word)) {
          parts.push({ text: word, type: "keyword" });
        } else if (jsxKeywords.includes(word.toLowerCase())) {
          parts.push({ text: word, type: "tag" });
        } else if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
          parts.push({ text: word, type: "component" });
        } else {
          parts.push({ text: word, type: "identifier" });
        }
        remaining = remaining.slice(word.length);
      }
    }
    // Operators and punctuation
    else {
      parts.push({ text: remaining[0], type: "punctuation" });
      remaining = remaining.slice(1);
    }
  }

  return (
    <>
      {parts.map((part, i) => {
        let className = "text-gray-300";
        switch (part.type) {
          case "keyword": className = "text-purple-400"; break;
          case "string": className = "text-emerald-400"; break;
          case "number": className = "text-amber-400"; break;
          case "comment": className = "text-gray-500 italic"; break;
          case "tag": className = "text-blue-400"; break;
          case "component": className = "text-cyan-400"; break;
          case "punctuation": className = "text-gray-400"; break;
        }
        return <span key={i} className={className}>{part.text}</span>;
      })}
    </>
  );
}

export default function SharedProject() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [activeFile, setActiveFile] = useState<number>(0);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = trpc.sharing.getShared.useQuery(
    { slug },
    { enabled: !!slug, retry: false }
  );

  const handleCopyCode = () => {
    if (data?.files?.[activeFile]) {
      navigator.clipboard.writeText(data.files[activeFile].content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Check if current file is previewable HTML
  const currentFile = data?.files?.[activeFile];
  const isPreviewable = currentFile && (
    currentFile.language === "html" ||
    currentFile.filename.endsWith(".html") ||
    currentFile.filename.endsWith(".htm")
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="text-sm text-white/40">Loading shared project...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Project Not Found</h1>
          <p className="text-sm text-white/50">
            This shared link may have been revoked or the project no longer exists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <span className="text-xs font-bold text-white">Q</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{data.title || data.project.name}</h1>
              <p className="text-xs text-white/40">
                {data.project.projectType} · {data.viewCount} views
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPreviewable && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-all " +
                  (showPreview
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10")}
              >
                <Eye className="w-3.5 h-3.5 inline mr-1.5" />
                Preview
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Description */}
      {(data.description || data.project.description) && (
        <div className="border-b border-white/5 px-6 py-3">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm text-white/60">{data.description || data.project.description}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* File List Sidebar */}
        {data.files && data.files.length > 0 && (
          <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-white/5 p-3 overflow-y-auto">
            <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">
                Files ({data.files.length})
              </span>
            </div>
            {data.files.map((file, idx) => (
              <button
                key={file.id}
                onClick={() => { setActiveFile(idx); setShowPreview(false); }}
                className={"w-full text-left px-3 py-2 rounded-lg text-xs transition-all mb-0.5 " +
                  (idx === activeFile
                    ? "bg-purple-500/10 text-purple-300 border border-purple-500/20"
                    : "text-white/60 hover:bg-white/5 hover:text-white/80 border border-transparent")}
              >
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file.filename}</span>
                </div>
                <span className="text-[10px] text-white/30 ml-5.5 block mt-0.5">{file.language}</span>
              </button>
            ))}
          </aside>
        )}

        {/* Code / Preview Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {data.files && data.files.length > 0 ? (
            <>
              {/* File Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white/80">{data.files[activeFile].filename}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                    {data.files[activeFile].language}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Code Content or Preview */}
              {showPreview && isPreviewable ? (
                <div className="flex-1 bg-white">
                  <iframe
                    srcDoc={currentFile?.content || ""}
                    className="w-full h-full min-h-[500px] border-0"
                    sandbox="allow-scripts allow-same-origin"
                    title="Live Preview"
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-auto bg-[#0D0D14]">
                  <SyntaxHighlighter
                    code={data.files[activeFile].content}
                    language={data.files[activeFile].language}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Code2 className="w-12 h-12 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/40">No code files in this project yet</p>
                <p className="text-xs text-white/20 mt-1">Files will appear here once generated</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">Q</span>
            </div>
            <span className="text-xs text-white/30">Built with Quoratorium</span>
          </div>
          <a
            href="https://quoratorium.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-white/30 hover:text-purple-400 transition-colors"
          >
            quoratorium.com
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
