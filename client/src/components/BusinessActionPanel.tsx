import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type ActionStatus =
  | "proposed"
  | "confirmed"
  | "executing"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired";

interface ActionRecord {
  id: string;
  status: ActionStatus;
  summary: string;
  payload: Record<string, any>;
  preview: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  expiresAt: string;
  updatedAt: string;
}

interface EditDraft {
  title: string;
  descriptionHtml: string;
  price: string;
  vendor: string;
  productType: string;
  tags: string;
}

function toEditDraft(action: ActionRecord): EditDraft {
  return {
    title: String(action.payload.title || ""),
    descriptionHtml: String(action.payload.descriptionHtml || ""),
    price: String(action.payload.price ?? ""),
    vendor: String(action.payload.vendor || ""),
    productType: String(action.payload.productType || ""),
    tags: Array.isArray(action.payload.tags) ? action.payload.tags.join(", ") : "",
  };
}

const statusLabel: Record<ActionStatus, string> = {
  proposed: "Waiting for your approval",
  confirmed: "Confirmed",
  executing: "Creating Shopify draft",
  completed: "Draft created",
  cancelled: "Cancelled",
  failed: "Needs attention",
  expired: "Expired",
};

export function BusinessActionPanel({ conversationId }: { conversationId: number | null }) {
  const utils = trpc.useUtils();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [connectingActionId, setConnectingActionId] = useState<string | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const actionsQuery = trpc.businessActions.list.useQuery(
    { conversationId: conversationId || undefined, includeTerminal: true },
    { enabled: Boolean(conversationId), refetchInterval: 10_000 },
  );
  const connectionQuery = trpc.businessActions.connectionStatus.useQuery(undefined, {
    enabled: Boolean(conversationId),
  });

  const refresh = async () => {
    await Promise.all([
      utils.businessActions.list.invalidate(),
      utils.businessActions.connectionStatus.invalidate(),
    ]);
  };

  const editMutation = trpc.businessActions.editShopifyDraft.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      setEditDraft(null);
      await refresh();
      toast.success("Shopify draft proposal updated.");
    },
    onError: error => toast.error(error.message),
  });
  const cancelMutation = trpc.businessActions.cancel.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Proposal cancelled. Nothing was sent to Shopify.");
    },
    onError: error => toast.error(error.message),
  });
  const connectMutation = trpc.businessActions.connectShopify.useMutation({
    onSuccess: async result => {
      setConnectingActionId(null);
      setAccessToken("");
      setShopDomain(result.shopDomain);
      await refresh();
      toast.success(`Connected to ${result.shopName}.`);
    },
    onError: error => toast.error(error.message),
  });
  const confirmMutation = trpc.businessActions.confirmShopifyDraft.useMutation({
    onSuccess: async action => {
      setConfirmingId(null);
      await refresh();
      if (action.status === "completed") {
        toast.success("Shopify product draft created.");
      } else {
        toast.error(action.error || "Shopify could not create the draft.");
      }
    },
    onError: error => toast.error(error.message),
  });

  const actions = useMemo(
    () => ((actionsQuery.data || []) as ActionRecord[])
      .filter(action => action.status !== "cancelled")
      .slice(0, 6),
    [actionsQuery.data],
  );

  useEffect(() => {
    if (!conversationId) {
      setEditingId(null);
      setConfirmingId(null);
      setEditDraft(null);
    }
  }, [conversationId]);

  if (!conversationId || actions.length === 0) return null;

  const shopify = connectionQuery.data?.shopify;

  return (
    <div className="border-t border-border bg-background/90 px-3 py-3 sm:px-4" data-testid="business-action-panel">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {actions.map(action => {
          const preview = action.preview || {};
          const isPending = action.status === "proposed" || action.status === "confirmed";
          const isExecuting = action.status === "executing";
          const result = action.result || {};
          const isEditing = editingId === action.id && editDraft;

          return (
            <section key={action.id} className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-0.5 rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
                    <Store size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/75">Shopify product draft</p>
                    <h3 className="truncate text-sm font-semibold text-foreground">{String(preview.title || action.summary)}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{statusLabel[action.status]}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border bg-background/60 px-2 py-1 text-[9px] font-semibold text-muted-foreground">
                  {action.status.toUpperCase()}
                </span>
              </div>

              {isEditing ? (
                <div className="mt-3 grid gap-2">
                  <label className="grid gap-1 text-[10px] text-muted-foreground">
                    Title
                    <input
                      value={editDraft.title}
                      onChange={event => setEditDraft({ ...editDraft, title: event.target.value })}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1 text-[10px] text-muted-foreground">
                      Price
                      <input
                        inputMode="decimal"
                        value={editDraft.price}
                        onChange={event => setEditDraft({ ...editDraft, price: event.target.value })}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      />
                    </label>
                    <label className="grid gap-1 text-[10px] text-muted-foreground">
                      Product type
                      <input
                        value={editDraft.productType}
                        onChange={event => setEditDraft({ ...editDraft, productType: event.target.value })}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-[10px] text-muted-foreground">
                    Vendor
                    <input
                      value={editDraft.vendor}
                      onChange={event => setEditDraft({ ...editDraft, vendor: event.target.value })}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] text-muted-foreground">
                    Tags, separated by commas
                    <input
                      value={editDraft.tags}
                      onChange={event => setEditDraft({ ...editDraft, tags: event.target.value })}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] text-muted-foreground">
                    Description
                    <textarea
                      value={editDraft.descriptionHtml}
                      onChange={event => setEditDraft({ ...editDraft, descriptionHtml: event.target.value })}
                      rows={4}
                      className="resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft(null);
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                    <button
                      disabled={editMutation.isPending || !editDraft.title.trim() || !Number.isFinite(Number(editDraft.price))}
                      onClick={() => editMutation.mutate({
                        actionId: action.id,
                        product: {
                          ...action.payload,
                          title: editDraft.title,
                          descriptionHtml: editDraft.descriptionHtml,
                          price: Number(editDraft.price),
                          vendor: editDraft.vendor || undefined,
                          productType: editDraft.productType || undefined,
                          tags: editDraft.tags.split(",").map(tag => tag.trim()).filter(Boolean),
                        },
                      })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {editMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save changes
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-background/50 p-2.5 text-xs">
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Price</p>
                      <p className="font-medium text-foreground">${String(preview.price || "0.00")}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Visibility</p>
                      <p className="font-medium text-foreground">Draft only</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Images</p>
                      <p className="font-medium text-foreground">{Number(preview.imageCount || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Publishes</p>
                      <p className="font-medium text-foreground">Never automatically</p>
                    </div>
                  </div>

                  {action.status === "failed" && (
                    <p className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-[11px] text-destructive">
                      {action.error || "Shopify could not create this draft."}
                    </p>
                  )}

                  {action.status === "completed" && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px] text-emerald-300">
                      <span className="inline-flex items-center gap-1.5"><Check size={13} /> Created as an unpublished draft.</span>
                      {typeof result.adminUrl === "string" && (
                        <a href={result.adminUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                          Open <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  )}

                  {isPending && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {action.status === "proposed" && (
                        <button
                          onClick={() => {
                            setEditingId(action.id);
                            setEditDraft(toEditDraft(action));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      )}
                      <button
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate({ actionId: action.id })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <X size={13} /> Cancel
                      </button>
                      <button
                        disabled={!shopify?.configured}
                        onClick={() => setConfirmingId(action.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ShieldCheck size={13} /> Review and confirm
                      </button>
                    </div>
                  )}

                  {isPending && !connectionQuery.isLoading && !shopify?.configured && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-amber-400/5 p-2">
                      <p className="text-[10px] text-amber-300/80">Shopify is not connected. This proposal is saved and cannot run yet.</p>
                      <button
                        onClick={() => setConnectingActionId(action.id)}
                        className="shrink-0 rounded-md border border-amber-300/20 px-2 py-1 text-[10px] font-medium text-amber-200"
                      >
                        Connect
                      </button>
                    </div>
                  )}

                  {isPending && shopify?.configured && (
                    <p className="mt-2 text-[10px] text-emerald-300/70">Connected securely to {shopify.shopDomain}.</p>
                  )}

                  {isExecuting && (
                    <p className="mt-3 inline-flex items-center gap-2 text-xs text-primary">
                      <Loader2 size={14} className="animate-spin" /> Creating one unpublished Shopify draft…
                    </p>
                  )}
                </>
              )}

              {connectingActionId === action.id && (
                <div className="fixed inset-0 z-[100] grid place-items-end bg-black/75 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-label="Connect Shopify">
                  <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck size={18} /></div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Connect Shopify securely</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Enter the permanent <strong className="text-foreground">.myshopify.com</strong> domain and an Admin API token with <strong className="text-foreground">write_products</strong>. Q verifies the token, encrypts it on the server, and never sends it to the model.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-1 text-[10px] text-muted-foreground">
                        Store domain
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          placeholder="your-store.myshopify.com"
                          value={shopDomain}
                          onChange={event => setShopDomain(event.target.value)}
                          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                      </label>
                      <label className="grid gap-1 text-[10px] text-muted-foreground">
                        Admin API access token
                        <input
                          type="password"
                          autoComplete="off"
                          placeholder="shpat_…"
                          value={accessToken}
                          onChange={event => setAccessToken(event.target.value)}
                          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                      </label>
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                      Connecting does not create, edit, or publish a product. Every store change still requires its own confirmation card.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setConnectingActionId(null);
                          setAccessToken("");
                        }}
                        className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={connectMutation.isPending || !shopDomain.trim() || accessToken.trim().length < 20}
                        onClick={() => connectMutation.mutate({
                          shopDomain: shopDomain.trim(),
                          accessToken: accessToken.trim(),
                        })}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        Verify and save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {confirmingId === action.id && (
                <div className="fixed inset-0 z-[100] grid place-items-end bg-black/75 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-label="Confirm Shopify draft creation">
                  <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-amber-500/10 p-2 text-amber-300"><AlertTriangle size={18} /></div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Create this Shopify draft?</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          This will add one product to Shopify as <strong className="text-foreground">DRAFT</strong>. It will not be visible to customers and will not be published to a sales channel.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                      <p className="font-medium text-foreground">{String(preview.title || action.summary)}</p>
                      <p className="mt-1 text-muted-foreground">${String(preview.price || "0.00")} · {Number(preview.imageCount || 0)} image(s)</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Go back
                      </button>
                      <button
                        disabled={confirmMutation.isPending}
                        onClick={() => confirmMutation.mutate({ actionId: action.id })}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {confirmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        Create DRAFT
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
