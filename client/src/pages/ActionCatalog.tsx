import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";

const riskStyles: Record<string, string> = {
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
};

const statusStyles: Record<string, string> = {
  enabled: "text-emerald-300",
  planned: "text-amber-300",
  disabled: "text-red-300",
};

const confirmationLabels: Record<string, string> = {
  none: "No extra confirmation",
  review_then_confirm: "Review before use",
  always_confirm: "Owner confirmation every time",
  disabled: "Not permitted",
};

function formatEventType(value: string): string {
  return value.replaceAll("_", " ");
}

export default function ActionCatalog() {
  const catalogQuery = trpc.actions.catalog.useQuery(undefined, {
    retry: false,
  });
  const serviceStatusQuery = trpc.actions.serviceStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 60_000,
  });
  const auditQuery = trpc.actions.audit.useQuery(
    { limit: 50 },
    { retry: false }
  );

  const systems = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof catalogQuery.data>>();
    for (const capability of catalogQuery.data || []) {
      const group = groups.get(capability.system) || [];
      group.push(capability);
      groups.set(capability.system, group);
    }
    return Array.from(groups.entries());
  }, [catalogQuery.data]);

  const serviceStatusBySystem = useMemo(() => {
    const statuses = new Map<
      string,
      NonNullable<typeof serviceStatusQuery.data>[number]
    >();
    for (const status of serviceStatusQuery.data || []) {
      statuses.set(status.system, status);
    }
    return statuses;
  }, [serviceStatusQuery.data]);

  const enabledCount = (catalogQuery.data || []).filter(
    item => item.status === "enabled"
  ).length;
  const blockedCount = (catalogQuery.data || []).filter(
    item => item.status === "disabled"
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Toríu control plane
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Action Catalog
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              The live permission boundary for every action Toríu can take.
              Capabilities are callable only when enabled, and consequential
              writes still require your separate owner confirmation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:min-w-56">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
              <div className="text-2xl font-semibold text-emerald-300">
                {enabledCount}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Enabled
              </div>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
              <div className="text-2xl font-semibold text-red-300">
                {blockedCount}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Blocked
              </div>
            </div>
          </div>
        </div>

        {catalogQuery.isLoading ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading the enforced capability registry…
          </div>
        ) : catalogQuery.error ? (
          <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
            {catalogQuery.error.message}
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {systems.map(([system, capabilities]) => (
              <section
                key={system}
                className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-primary">
                      <ShieldCheck size={17} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {system}
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        {
                          capabilities.filter(item => item.status === "enabled")
                            .length
                        }{" "}
                        of {capabilities.length} capabilities enabled
                      </p>
                    </div>
                  </div>
                  {serviceStatusBySystem.get(system) ? (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        serviceStatusBySystem.get(system)?.connected
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      }`}
                      title={serviceStatusBySystem.get(system)?.message}
                    >
                      {serviceStatusBySystem.get(system)?.connected ? (
                        <CheckCircle2 size={11} />
                      ) : (
                        <AlertTriangle size={11} />
                      )}
                      {serviceStatusBySystem.get(system)?.connected
                        ? "Connected"
                        : "Unavailable"}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {capabilities.map(capability => (
                    <article
                      key={capability.id}
                      className="rounded-xl border border-border/80 bg-background/55 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground">
                              {capability.name}
                            </h3>
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wider ${statusStyles[capability.status] || "text-muted-foreground"}`}
                            >
                              {capability.status}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            {capability.description}
                          </p>
                        </div>
                        {capability.status === "enabled" ? (
                          <CheckCircle2
                            className="mt-0.5 shrink-0 text-emerald-400"
                            size={18}
                          />
                        ) : (
                          <LockKeyhole
                            className="mt-0.5 shrink-0 text-red-400"
                            size={18}
                          />
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {capability.permission}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${riskStyles[capability.risk] || "border-border text-muted-foreground"}`}
                        >
                          {capability.risk} risk
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground">
                          <KeyRound size={10} />
                          {confirmationLabels[capability.confirmation] ||
                            capability.confirmation}
                        </span>
                      </div>
                      <p className="mt-3 break-all font-mono text-[9px] text-muted-foreground/60">
                        {capability.id}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-primary">
              <Activity size={17} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Capability audit
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Owner-scoped events with secret and content fields removed.
              </p>
            </div>
          </div>

          {auditQuery.isLoading ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Loading audited actions…
            </p>
          ) : auditQuery.error ? (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {auditQuery.error.message}
            </div>
          ) : (auditQuery.data || []).length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              No cataloged capability has run yet.
            </p>
          ) : (
            <div className="mt-5 divide-y divide-border/70 rounded-xl border border-border/80 bg-background/55">
              {(auditQuery.data || []).map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 sm:p-4"
                >
                  <Clock3 size={15} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold capitalize text-foreground">
                        {formatEventType(event.eventType)}
                      </p>
                      <time className="text-[10px] text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {event.summary ||
                        event.agentName ||
                        "Capability action recorded"}
                    </p>
                    {event.payload?.capability ? (
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground/60">
                        {String(event.payload.capability)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
