/**
 * Q Workspace — Knowledge Base Page
 * Upload documents, view indexed files, semantic search, and manage the RAG knowledge base.
 */
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback } from "react";
import {
  BookOpen,
  Upload,
  Search,
  Trash2,
  FileText,
  File,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Database,
  Layers,
  HardDrive,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { duration, ease } from "@/lib/motion";

const ACCEPTED_TYPES = [
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 size={10} />
          Ready
        </span>
      );
    case "indexing":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Loader2 size={10} className="animate-spin" />
          Indexing
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertCircle size={10} />
          Error
        </span>
      );
    default:
      return null;
  }
}

export default function Knowledge() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents, refetch: refetchDocs } = trpc.knowledge.list.useQuery();
  const { data: stats } = trpc.knowledge.stats.useQuery();

  const uploadMutation = trpc.knowledge.upload.useMutation({
    onSuccess: () => {
      refetchDocs();
      toast.success("Document uploaded and indexed successfully");
    },
    onError: (err) => {
      toast.error(`Upload failed: ${err.message}`);
    },
  });

  const deleteMutation = trpc.knowledge.delete.useMutation({
    onSuccess: () => {
      refetchDocs();
      toast.success("Document deleted");
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  const searchMutation = trpc.knowledge.search.useMutation();

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    setIsUploading(true);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }

      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(txt|md|csv|json|js|ts|py|html|pdf|tsx|jsx)$/)) {
        toast.error(`${file.name}: unsupported file type`);
        continue;
      }

      try {
        const content = await readFileAsBase64(file);
        await uploadMutation.mutateAsync({
          filename: file.name,
          content,
          mimeType: file.type || "text/plain",
          fileSize: file.size,
        });
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err?.message || "Unknown error"}`);
      }
    }
    setIsUploading(false);
  }, [uploadMutation]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchMutation.mutateAsync({ query: searchQuery, topK: 5 });
      setSearchResults(results);
    } catch (err: any) {
      toast.error(`Search failed: ${err?.message || "Unknown error"}`);
    }
    setIsSearching(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav />
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-6xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.normal, ease: ease.out }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BookOpen size={20} className="text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-display font-bold tracking-tight">Knowledge Base</h1>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wider">Beta</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Upload documents for Captain to reference during conversations</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-2"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload
            </Button>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 rounded-lg border border-border surface-elevated">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Database size={12} />
                  <span className="text-[10px] uppercase tracking-wider font-medium">Documents</span>
                </div>
                <p className="text-lg font-bold">{stats.totalDocuments}</p>
              </div>
              <div className="p-3 rounded-lg border border-border surface-elevated">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Layers size={12} />
                  <span className="text-[10px] uppercase tracking-wider font-medium">Chunks</span>
                </div>
                <p className="text-lg font-bold">{stats.totalChunks}</p>
              </div>
              <div className="p-3 rounded-lg border border-border surface-elevated">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <HardDrive size={12} />
                  <span className="text-[10px] uppercase tracking-wider font-medium">Storage</span>
                </div>
                <p className="text-lg font-bold">{formatBytes(stats.totalSizeBytes)}</p>
              </div>
              <div className="p-3 rounded-lg border border-border surface-elevated">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle2 size={12} />
                  <span className="text-[10px] uppercase tracking-wider font-medium">Ready</span>
                </div>
                <p className="text-lg font-bold text-emerald-400">{stats.readyDocuments}</p>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="mb-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search your knowledge base semantically..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9 h-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} size="sm" className="h-10 px-4">
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : "Search"}
              </Button>
            </div>

            {/* Search Results */}
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  className="mt-4 space-y-3"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {searchResults.length} results found
                    </h3>
                    <button
                      onClick={() => setSearchResults([])}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {searchResults.map((result, i) => (
                    <motion.div
                      key={result.chunkId}
                      className="p-4 rounded-lg border border-border surface-elevated"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-primary">{result.filename}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(result.similarity * 100).toFixed(1)}% match
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 line-clamp-3">{result.content}</p>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Upload Drop Zone */}
          <div
            className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload size={24} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-1">
              Drag and drop files here, or{" "}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-primary hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Supported: TXT, MD, CSV, JSON, JS, TS, PY, HTML, PDF (max 10MB)
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files);
                e.target.value = "";
              }
            }}
          />

          {/* Documents List */}
          <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-4">
              Indexed Documents ({documents?.length || 0})
            </h2>

            {!documents || documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">No documents yet</p>
                <p className="text-xs mt-1">Upload files to build your knowledge base</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc, i) => (
                  <motion.div
                    key={doc.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border surface-elevated group"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={{ backgroundColor: "rgba(30, 30, 42, 0.4)" }}
                  >
                    <div className="w-9 h-9 rounded-md bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                      <File size={16} className="text-primary/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.filename}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">{formatBytes(doc.fileSize)}</span>
                        <span className="text-[10px] text-muted-foreground">{doc.chunkCount} chunks</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={doc.status} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive h-8 w-8 p-0"
                      onClick={() => deleteMutation.mutate({ documentId: doc.id })}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:text/plain;base64,")
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
