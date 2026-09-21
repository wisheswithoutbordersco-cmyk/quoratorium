import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileImage,
  FileText,
  Layers3,
  LoaderCircle,
  PackageCheck,
  ScanSearch,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import type { RecyclatoriumMode, RecyclatoriumPlan } from "@shared/recyclatorium";
import {
  buildRecyclatoriumPdf,
  buildRecyclatoriumZip,
  renderRecyclatoriumCover,
  safeProductFilename,
  type RecyclatoriumPdfAsset,
} from "@/lib/recyclatoriumPdf";

interface UploadedAsset {
  id: string;
  file: File;
  dataUrl: string;
  previewUrl?: string;
  selected: boolean;
}

interface GeneratedProduct {
  pdfBytes: Uint8Array;
  pdfUrl: string;
  coverJpeg: Blob;
}

const modes: Array<{ id: RecyclatoriumMode; title: string; description: string }> = [
  { id: "recombine", title: "Recombine", description: "Find the strongest shared theme and build one coherent learning pack." },
  { id: "transform", title: "Transform", description: "Turn the source material into a distinctly different printable format." },
  { id: "invent", title: "Invent", description: "Use the visual material as a spark for a fresh product concept." },
];

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = url;
  });
}

async function preparePdfAsset(asset: UploadedAsset): Promise<RecyclatoriumPdfAsset> {
  if (!asset.file.type.startsWith("image/")) {
    return {
      name: asset.file.name,
      mimeType: asset.file.type || "application/pdf",
      bytes: new Uint8Array(await asset.file.arrayBuffer()),
    };
  }

  const image = await loadImage(asset.previewUrl || asset.dataUrl);
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`Could not process ${asset.file.name}`);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error(`Could not render ${asset.file.name}`)), "image/png");
  });
  return {
    name: asset.file.name,
    mimeType: "image/png",
    bytes: new Uint8Array(await blob.arrayBuffer()),
    previewUrl: asset.previewUrl,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function downloadBytes(bytes: Uint8Array, filename: string, type: string) {
  downloadBlob(new Blob([bytes as BlobPart], { type }), filename);
}

export default function Recyclatorium() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [mode, setMode] = useState<RecyclatoriumMode>("recombine");
  const [plan, setPlan] = useState<RecyclatoriumPlan | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedProduct | null>(null);
  const [building, setBuilding] = useState(false);
  const [dragging, setDragging] = useState(false);

  const selectedAssets = useMemo(() => assets.filter(asset => asset.selected), [assets]);
  const analyzeMutation = trpc.recyclatorium.analyze.useMutation();

  const addFiles = async (list: FileList | File[]) => {
    const incoming = Array.from(list).filter(file => file.type.startsWith("image/") || file.type === "application/pdf");
    if (!incoming.length) {
      toast.error("Choose PNG, JPG, WEBP, SVG, or PDF files.");
      return;
    }
    if (assets.length + incoming.length > 6) {
      toast.error("Recyclatorium can analyze up to 6 assets at once.");
      return;
    }
    try {
      const additions = await Promise.all(incoming.map(async file => ({
        id: crypto.randomUUID(),
        file,
        dataUrl: await fileToDataUrl(file),
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        selected: true,
      })));
      setAssets(current => [...current, ...additions]);
      setPlan(null);
      setGenerated(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "One or more files could not be read.");
    }
  };

  const clearAll = () => {
    assets.forEach(asset => asset.previewUrl && URL.revokeObjectURL(asset.previewUrl));
    if (generated?.pdfUrl) URL.revokeObjectURL(generated.pdfUrl);
    setAssets([]);
    setPlan(null);
    setGenerated(null);
    setAnalysisModel(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const analyze = async () => {
    if (!selectedAssets.length) {
      toast.error("Select at least one asset first.");
      return;
    }
    setGenerated(null);
    try {
      const result = await analyzeMutation.mutateAsync({
        mode,
        assets: selectedAssets.map(asset => ({
          name: asset.file.name,
          mimeType: asset.file.type || "application/octet-stream",
          dataUrl: asset.dataUrl,
        })),
      });
      setPlan(result.plan);
      setAnalysisModel(result.model);
      toast.success(`Visual analysis complete${result.fallbackUsed ? " using the backup vision model" : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Visual analysis failed.");
    }
  };

  const buildProduct = async () => {
    if (!plan) return;
    setBuilding(true);
    try {
      const preparedAssets = await Promise.all(selectedAssets.map(preparePdfAsset));
      const [pdfBytes, coverJpeg] = await Promise.all([
        buildRecyclatoriumPdf(plan, preparedAssets),
        renderRecyclatoriumCover(plan, preparedAssets),
      ]);
      if (generated?.pdfUrl) URL.revokeObjectURL(generated.pdfUrl);
      const pdfUrl = URL.createObjectURL(new Blob([pdfBytes as BlobPart], { type: "application/pdf" }));
      setGenerated({ pdfBytes, pdfUrl, coverJpeg });
      toast.success(`Built ${plan.activities.length} original activities plus cover and teacher guide.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Product generation failed.");
    } finally {
      setBuilding(false);
    }
  };

  const downloadPdf = () => {
    if (!generated || !plan) return;
    downloadBytes(generated.pdfBytes, `${safeProductFilename(plan.title)}.pdf`, "application/pdf");
  };

  const downloadZip = async () => {
    if (!generated || !plan) return;
    try {
      const archive = await buildRecyclatoriumZip(plan, generated.pdfBytes, generated.coverJpeg, selectedAssets.map(asset => asset.file.name));
      downloadBlob(archive, `${safeProductFilename(plan.title)}-complete-package.zip`);
      toast.success("Complete product package downloaded. Original uploads were excluded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ZIP packaging failed.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-primary/15 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/workspace/launchpad" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary">
              <ArrowLeft className="h-4 w-4" /> Back to launchpad
            </Link>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight">Recyclatorium</h1>
                <p className="mt-1 text-sm text-muted-foreground">Inspect the material. Design a new learning product. Export only the finished work.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-300">Real visual analysis</span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-primary">No filename fallback</span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <section className="ember-card p-5 lg:p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Step 1</p>
                  <h2 className="mt-1 text-xl font-semibold">Source assets</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Up to six images or PDFs. Originals guide the design but never go into the ZIP.</p>
                </div>
                {assets.length > 0 && (
                  <button onClick={clearAll} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-red-400/30 hover:text-red-300">
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
                className="hidden"
                onChange={event => event.target.files && void addFiles(event.target.files)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={event => { event.preventDefault(); setDragging(true); }}
                onDragOver={event => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={event => {
                  event.preventDefault();
                  setDragging(false);
                  void addFiles(event.dataTransfer.files);
                }}
                className={`group grid min-h-44 w-full place-items-center rounded-2xl border border-dashed px-6 text-center transition-all ${dragging ? "border-primary bg-primary/10" : "border-primary/25 bg-black/20 hover:border-primary/60 hover:bg-primary/[0.06]"}`}
              >
                <span>
                  <UploadCloud className="mx-auto h-8 w-8 text-primary transition-transform group-hover:-translate-y-1" />
                  <span className="mt-3 block font-semibold">Drop files here or choose from your computer</span>
                  <span className="mt-1 block text-xs text-muted-foreground">PNG, JPG, WEBP, SVG, PDF · 6 files maximum</span>
                </span>
              </button>

              {assets.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {assets.map(asset => (
                    <label key={asset.id} className={`relative flex min-h-24 gap-3 overflow-hidden rounded-xl border p-3 transition-colors ${asset.selected ? "border-primary/35 bg-primary/[0.06]" : "border-white/10 bg-black/10 opacity-55"}`}>
                      <input
                        type="checkbox"
                        checked={asset.selected}
                        onChange={event => {
                          setAssets(current => current.map(item => item.id === asset.id ? { ...item, selected: event.target.checked } : item));
                          setPlan(null);
                          setGenerated(null);
                        }}
                        className="mt-1 accent-orange-500"
                      />
                      {asset.previewUrl ? (
                        <img src={asset.previewUrl} alt="" className="h-16 w-16 rounded-lg bg-white object-contain" />
                      ) : (
                        <div className="grid h-16 w-16 place-items-center rounded-lg bg-red-500/10 text-red-300"><FileText className="h-6 w-6" /></div>
                      )}
                      <span className="min-w-0 py-1">
                        <span className="block truncate text-sm font-medium">{asset.file.name}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">{(asset.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="ember-card p-5 lg:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Step 2</p>
              <h2 className="mt-1 text-xl font-semibold">Choose the transformation</h2>
              <div className="mt-4 grid gap-3">
                {modes.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { setMode(option.id); setPlan(null); setGenerated(null); }}
                    className={`rounded-xl border p-4 text-left transition-all ${mode === option.id ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(216,102,24,0.12)]" : "border-white/10 bg-black/15 hover:border-primary/25"}`}
                  >
                    <span className="flex items-center gap-2 font-semibold"><WandSparkles className={`h-4 w-4 ${mode === option.id ? "text-primary" : "text-muted-foreground"}`} />{option.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void analyze()}
                disabled={!selectedAssets.length || analyzeMutation.isPending}
                className="ember-button mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                {analyzeMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                {analyzeMutation.isPending ? "Inspecting every asset..." : "Analyze and design product"}
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">Visual analysis uses Gemini 3 Flash Preview, with GPT-4o Mini as a vision backup.</p>
            </section>
          </div>

          <div className="space-y-6">
            {!plan ? (
              <section className="grid min-h-[520px] place-items-center rounded-3xl border border-primary/15 bg-[radial-gradient(circle_at_top_right,rgba(216,102,24,0.12),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.025),rgba(0,0,0,0.18))] p-8 text-center">
                <div className="max-w-md">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-primary/25 bg-primary/10 text-primary"><Sparkles className="h-7 w-7" /></div>
                  <h2 className="mt-5 text-2xl font-semibold">The new product will appear here</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">Recyclatorium will inspect the actual visuals, propose original activities, and build a printable PDF instead of repackaging the files you supplied.</p>
                  <div className="mt-6 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="rounded-lg border border-white/10 px-2 py-3">Analyze</span>
                    <span className="rounded-lg border border-white/10 px-2 py-3">Compose</span>
                    <span className="rounded-lg border border-white/10 px-2 py-3">Package</span>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="overflow-hidden rounded-3xl border border-primary/20 bg-[#fffdf4] text-[#222a31] shadow-2xl shadow-black/30">
                  <div className="border-b border-black/10 px-6 py-5" style={{ background: `linear-gradient(120deg, ${plan.palette[0]}24, ${plan.palette[1]}20)` }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white" style={{ backgroundColor: plan.palette[0] }}>New product plan</span>
                      <span className="text-xs text-[#68727a]">{analysisModel}</span>
                    </div>
                    <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight">{plan.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#59636a]">{plan.subtitle}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[plan.theme, plan.ageGrade, plan.productType].map(value => <span key={value} className="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold">{value}</span>)}
                    </div>
                  </div>
                  <div className="grid gap-5 p-6 lg:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: plan.palette[0] }}>What the system actually saw</h3>
                      <p className="mt-2 text-sm leading-6 text-[#4f5b62]">{plan.visualSummary}</p>
                    </div>
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: plan.palette[1] }}>Why this becomes one product</h3>
                      <p className="mt-2 text-sm leading-6 text-[#4f5b62]">{plan.whyTogether}</p>
                    </div>
                  </div>
                </section>

                <section className="ember-card p-5 lg:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Step 3</p>
                      <h2 className="mt-1 text-xl font-semibold">Original activity sequence</h2>
                    </div>
                    <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-muted-foreground">{plan.activities.length} new activities</span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {plan.activities.map((activity, index) => (
                      <article key={`${activity.title}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-black text-[#181818]" style={{ backgroundColor: plan.palette[index % plan.palette.length] }}>{index + 1}</span>
                          <div className="min-w-0">
                            <h3 className="font-semibold">{activity.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{activity.instructions}</p>
                            <p className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-primary"><FileImage className="h-3 w-3" /> Uses {activity.sourceAsset}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void buildProduct()}
                    disabled={building}
                    className="ember-button mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {building ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                    {building ? "Composing printable pages..." : "Build the actual printable product"}
                  </button>
                </section>
              </>
            )}

            {generated && plan && (
              <section className="ember-card overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-primary/15 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Product built successfully</p>
                    <p className="mt-1 text-xs text-muted-foreground">Cover + teacher guide + {plan.activities.length} activities + credits page</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={downloadPdf} className="ember-button-secondary ember-button-small"><Download className="h-3.5 w-3.5" /> PDF</button>
                    <button onClick={() => void downloadZip()} className="ember-button ember-button-small"><PackageCheck className="h-3.5 w-3.5" /> Complete ZIP</button>
                  </div>
                </div>
                <div className="border-b border-emerald-400/15 bg-emerald-400/[0.06] px-5 py-3 text-xs text-emerald-200 lg:px-6">
                  The ZIP contains six generated deliverables. Original uploaded files are not copied into it.
                </div>
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-2 px-2 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Generated PDF preview</div>
                  <iframe title="Generated product preview" src={generated.pdfUrl} className="h-[720px] w-full rounded-xl bg-white" />
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
