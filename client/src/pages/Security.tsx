/**
 * Q Workspace — Security Dashboard
 * 
 * Container isolation, filesystem restrictions, network egress, quotas,
 * execution timeouts, and prompt injection protection monitoring.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { TopNav } from "@/components/TopNav";
import {
  Shield, ShieldAlert, ShieldCheck, Lock, Globe, HardDrive,
  Cpu, RefreshCw, AlertTriangle, Ban, Eye
} from "lucide-react";

type Tab = "overview" | "violations" | "policy" | "scanner";

export default function Security() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: summary, refetch, isLoading } = trpc.security.summary.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <Shield size={14} /> },
    { id: "violations", label: "Violations", icon: <ShieldAlert size={14} /> },
    { id: "policy", label: "Policy", icon: <Lock size={14} /> },
    { id: "scanner", label: "Scanner", icon: <Eye size={14} /> },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden surface-base">
      <TopNav />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              Security
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Sandbox isolation, injection protection, and access control</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-medium flex items-center gap-1 ${
              (summary?.criticalViolations || 0) > 0 ? "bg-red-500/10 text-red-400" :
              (summary?.highViolations || 0) > 0 ? "bg-amber-500/10 text-amber-400" :
              "bg-emerald-500/10 text-emerald-400"
            }`}>
              <ShieldCheck size={10} />
              {(summary?.criticalViolations || 0) > 0 ? "THREATS DETECTED" :
               (summary?.highViolations || 0) > 0 ? "WARNINGS" : "SECURE"}
            </div>
            <button
              onClick={() => refetch()}
              className="p-2 rounded-md surface-elevated border border-border text-muted-foreground hover:text-primary transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 border-b border-border flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "overview" && <OverviewPanel summary={summary} />}
          {activeTab === "violations" && <ViolationsPanel violations={summary?.recentViolations} />}
          {activeTab === "policy" && <PolicyPanel />}
          {activeTab === "scanner" && <ScannerPanel />}
        </div>
      </div>
    </div>
  );
}

function OverviewPanel({ summary }: { summary: any }) {
  if (!summary) return <LoadingSkeleton />;

  const stats = [
    { label: "Total Violations", value: summary.totalViolations, icon: <ShieldAlert size={14} />, color: "text-red-400" },
    { label: "Blocked", value: summary.blockedAttempts, icon: <Ban size={14} />, color: "text-amber-400" },
    { label: "Injection Attempts", value: summary.injectionAttempts, icon: <AlertTriangle size={14} />, color: "text-purple-400" },
    { label: "Network Blocks", value: summary.networkBlocks, icon: <Globe size={14} />, color: "text-blue-400" },
    { label: "Active Executions", value: summary.activeExecutions, icon: <Cpu size={14} />, color: "text-emerald-400" },
    { label: "Critical", value: summary.criticalViolations, icon: <ShieldAlert size={14} />, color: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="surface-elevated border border-border rounded-lg p-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className={`flex items-center gap-1.5 mb-1 ${stat.color}`}>
              {stat.icon}
              <span className="text-[10px] uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-lg font-semibold text-foreground">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Violations by Type */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Violations by Type</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(summary.violationsByType || {}).map(([type, count]) => (
            <div key={type} className="text-center p-3 rounded-md bg-white/[0.02] border border-border/50">
              <p className="text-lg font-mono text-foreground">{count as number}</p>
              <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{type}</p>
            </div>
          ))}
          {Object.keys(summary.violationsByType || {}).length === 0 && (
            <p className="text-xs text-muted-foreground/50 col-span-full text-center py-4">No violations recorded</p>
          )}
        </div>
      </div>

      {/* Severity Breakdown */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Severity Breakdown</h3>
        <div className="space-y-2">
          {[
            { label: "Critical", count: summary.criticalViolations, color: "bg-red-500" },
            { label: "High", count: summary.highViolations, color: "bg-orange-500" },
            { label: "Medium", count: summary.mediumViolations, color: "bg-amber-500" },
            { label: "Low", count: summary.lowViolations, color: "bg-blue-500" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16">{item.label}</span>
              <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.color}`}
                  style={{ width: `${summary.totalViolations > 0 ? (item.count / summary.totalViolations) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs font-mono text-foreground w-8 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ViolationsPanel({ violations }: { violations: any[] | undefined }) {
  if (!violations || violations.length === 0) {
    return (
      <div className="p-8 text-center">
        <ShieldCheck size={32} className="mx-auto text-emerald-400/50 mb-2" />
        <p className="text-xs text-muted-foreground/50">No security violations recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {violations.map((v, i) => (
        <motion.div
          key={i}
          className="surface-elevated border border-border rounded-lg p-3 flex items-start gap-3"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
            v.severity === "critical" ? "bg-red-500" :
            v.severity === "high" ? "bg-orange-500" :
            v.severity === "medium" ? "bg-amber-500" : "bg-blue-500"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">{v.message}</p>
            {v.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{v.detail}</p>}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-muted-foreground/60">{v.type}</span>
              <span className="text-[9px] text-muted-foreground/60">
                {new Date(v.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {v.blocked && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">BLOCKED</span>
            )}
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
              v.severity === "critical" ? "bg-red-500/10 text-red-400" :
              v.severity === "high" ? "bg-orange-500/10 text-orange-400" :
              v.severity === "medium" ? "bg-amber-500/10 text-amber-400" :
              "bg-blue-500/10 text-blue-400"
            }`}>
              {v.severity}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function PolicyPanel() {
  const { data: policy } = trpc.security.policy.useQuery();

  if (!policy) {
    return (
      <div className="p-8 text-center">
        <Lock size={32} className="mx-auto text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground/60">Security policy configuration will appear here</p>
        <p className="text-xs text-muted-foreground/40 mt-1">Default policies are currently active</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Execution Policy */}
      <PolicySection
        title="Execution Policy"
        icon={<Cpu size={14} />}
        items={[
          { label: "Max Execution Time", value: `${policy.execution.maxExecutionTimeMs / 1000}s` },
          { label: "Max Concurrent", value: String(policy.execution.maxConcurrentExecutions) },
          { label: "Sandbox Mode", value: policy.execution.sandboxMode },
          { label: "Allowed Languages", value: policy.execution.allowedLanguages.join(", ") },
        ]}
      />

      {/* Network Policy */}
      <PolicySection
        title="Network Policy"
        icon={<Globe size={14} />}
        items={[
          { label: "Egress Allowed", value: policy.network.egressAllowed ? "Yes" : "No" },
          { label: "Max Requests/min", value: String(policy.network.maxRequestsPerMinute) },
          { label: "Max Payload", value: `${policy.network.maxPayloadSizeBytes / 1024 / 1024}MB` },
          { label: "Allowed Protocols", value: policy.network.allowedProtocols.join(", ") },
        ]}
      />

      {/* Filesystem Policy */}
      <PolicySection
        title="Filesystem Policy"
        icon={<HardDrive size={14} />}
        items={[
          { label: "Read Allowed", value: policy.filesystem.readAllowed ? "Yes" : "No" },
          { label: "Write Allowed", value: policy.filesystem.writeAllowed ? "Yes" : "No" },
          { label: "Max File Size", value: `${policy.filesystem.maxFileSizeBytes / 1024 / 1024}MB` },
          { label: "Max Storage", value: `${policy.filesystem.maxTotalStorageBytes / 1024 / 1024}MB` },
        ]}
      />

      {/* Resource Policy */}
      <PolicySection
        title="Resource Quotas"
        icon={<Cpu size={14} />}
        items={[
          { label: "Max Memory", value: `${policy.resources.maxMemoryMB}MB` },
          { label: "Max CPU", value: `${policy.resources.maxCpuPercent}%` },
          { label: "Max Output", value: `${policy.resources.maxOutputSizeBytes / 1024}KB` },
          { label: "Max Processes", value: String(policy.resources.maxProcesses) },
        ]}
      />

      {/* Injection Policy */}
      <PolicySection
        title="Injection Protection"
        icon={<Shield size={14} />}
        items={[
          { label: "Enabled", value: policy.injection.enabled ? "Yes" : "No" },
          { label: "Max Prompt Length", value: policy.injection.maxPromptLength.toLocaleString() },
          { label: "Max Code Length", value: policy.injection.maxCodeLength.toLocaleString() },
          { label: "Sanitize Output", value: policy.injection.sanitizeOutput ? "Yes" : "No" },
          { label: "Block Prompt Leaks", value: policy.injection.blockSystemPromptLeaks ? "Yes" : "No" },
        ]}
      />
    </div>
  );
}

function PolicySection({ title, icon, items }: { title: string; icon: React.ReactNode; items: Array<{ label: string; value: string }> }) {
  return (
    <div className="surface-elevated border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
        {icon} {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between py-1.5 px-2 rounded bg-white/[0.02]">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-xs font-mono text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScannerPanel() {
  const [codeInput, setCodeInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [codeResult, setCodeResult] = useState<any>(null);
  const [promptResult, setPromptResult] = useState<any>(null);
  const [urlResult, setUrlResult] = useState<any>(null);

  const validateCode = trpc.security.validateCode.useMutation({
    onSuccess: (data) => setCodeResult(data),
  });
  const checkInjection = trpc.security.checkInjection.useMutation({
    onSuccess: (data) => setPromptResult(data),
  });
  const validateNetwork = trpc.security.validateNetwork.useMutation({
    onSuccess: (data) => setUrlResult(data),
  });

  const hasNoInput = !codeInput.trim() && !promptInput.trim() && !urlInput.trim();
  const hasNoResults = !codeResult && !promptResult && !urlResult;

  return (
    <div className="space-y-6">
      {/* Code Scanner */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Eye size={14} className="text-primary" /> Code Scanner
        </h3>
        <textarea
          value={codeInput}
          onChange={e => setCodeInput(e.target.value)}
          placeholder="Paste code to scan for security issues..."
          className="w-full h-24 px-3 py-2 text-xs font-mono bg-transparent border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-primary/30"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => validateCode.mutate({ code: codeInput, language: "javascript" })}
            disabled={!codeInput.trim()}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            Scan Code
          </button>
          {codeResult && (
            <span className={`text-xs ${codeResult.safe ? "text-emerald-400" : "text-red-400"}`}>
              {codeResult.safe ? "✓ Safe" : `✗ ${codeResult.violations.length} issue(s) found`}
            </span>
          )}
        </div>
      </div>

      {/* Prompt Injection Scanner */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Shield size={14} className="text-primary" /> Injection Scanner
        </h3>
        <textarea
          value={promptInput}
          onChange={e => setPromptInput(e.target.value)}
          placeholder="Paste text to check for prompt injection attempts..."
          className="w-full h-24 px-3 py-2 text-xs font-mono bg-transparent border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-primary/30"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => checkInjection.mutate({ text: promptInput })}
            disabled={!promptInput.trim()}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            Check Injection
          </button>
          {promptResult && (
            <span className={`text-xs ${promptResult.safe ? "text-emerald-400" : "text-red-400"}`}>
              {promptResult.safe ? `✓ Safe (score: ${promptResult.score})` : `✗ Suspicious (score: ${promptResult.score})`}
            </span>
          )}
        </div>
      </div>

      {/* Network Validator */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Globe size={14} className="text-primary" /> Network Validator
        </h3>
        <input
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="https://example.com/api/endpoint"
          className="w-full px-3 py-2 text-xs font-mono bg-transparent border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => validateNetwork.mutate({ url: urlInput })}
            disabled={!urlInput.trim()}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            Validate URL
          </button>
          {urlResult && (
            <span className={`text-xs ${urlResult.allowed ? "text-emerald-400" : "text-red-400"}`}>
              {urlResult.allowed ? "✓ Allowed" : `✗ Blocked: ${urlResult.reason}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-white/[0.02] animate-pulse" />
      ))}
    </div>
  );
}
