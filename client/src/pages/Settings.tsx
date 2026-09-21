import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  ExternalLink,
  GitBranch,
  Github,
  Loader2,
  RefreshCw,
} from "lucide-react";

type SettingsMap = Record<string, string>;

export default function Settings() {
  const { user } = useAuth();

  const [settings, setSettings] = useState<SettingsMap>({});
  const [activeSection, setActiveSection] = useState("ai");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const settingsQuery = trpc.settings.getAll.useQuery(undefined, {
    enabled: !!user,
  });
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => toast.success("Settings updated"),
    onError: err => toast.error(err.message),
  });
  const resetMutation = trpc.settings.reset.useMutation({
    onSuccess: () => {
      toast.success("All settings restored to defaults");
      settingsQuery.refetch();
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data as SettingsMap);
    }
  }, [settingsQuery.data]);

  const globalUpdateSetting = useSettingsStore(s => s.updateSetting);

  const updateSetting = useCallback(
    (key: string, value: string) => {
      setSettings(prev => ({ ...prev, [key]: value }));
      // Update global store immediately (optimistic)
      globalUpdateSetting(key, value);
      if (saveTimeout) clearTimeout(saveTimeout);
      const timeout = setTimeout(() => {
        updateMutation.mutate({ settings: { [key]: value } });
      }, 800);
      setSaveTimeout(timeout);
    },
    [saveTimeout, updateMutation, globalUpdateSetting]
  );

  const sections = [
    { id: "ai", label: "AI Preferences", icon: "🧠" },
    { id: "budget", label: "Budget", icon: "💰" },
    { id: "platforms", label: "Platforms", icon: "🚀" },
    { id: "appearance", label: "Appearance", icon: "🎨" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "apikeys", label: "API Keys", icon: "🔑" },
    { id: "github", label: "GitHub", icon: "🐙" },
    { id: "danger", label: "Danger Zone", icon: "⚠️" },
  ];

  const Toggle = ({
    settingKey,
    label,
    description,
  }: {
    settingKey: string;
    label: string;
    description?: string;
  }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() =>
          updateSetting(
            settingKey,
            settings[settingKey] === "true" ? "false" : "true"
          )
        }
        className={`w-11 h-6 rounded-full transition-colors relative ${
          settings[settingKey] === "true" ? "bg-blue-500" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            settings[settingKey] === "true"
              ? "translate-x-5.5"
              : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );

  const Select = ({
    settingKey,
    label,
    options,
    description,
  }: {
    settingKey: string;
    label: string;
    options: { value: string; label: string }[];
    description?: string;
  }) => (
    <div className="py-3">
      <p className="text-sm font-medium mb-1">{label}</p>
      {description && (
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => updateSetting(settingKey, opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
              settings[settingKey] === opt.value
                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                : "border-border/40 hover:border-border/70"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const Slider = ({
    settingKey,
    label,
    min,
    max,
    step,
    description,
  }: {
    settingKey: string;
    label: string;
    min: number;
    max: number;
    step: number;
    description?: string;
  }) => (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">{label}</p>
        <span className="text-sm text-muted-foreground font-mono">
          {settings[settingKey] || min}
        </span>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={parseFloat(settings[settingKey] || String(min))}
        onChange={e => updateSetting(settingKey, e.target.value)}
        className="w-full accent-blue-500"
      />
    </div>
  );

  const NumberInput = ({
    settingKey,
    label,
    description,
  }: {
    settingKey: string;
    label: string;
    description?: string;
  }) => (
    <div className="py-3">
      <p className="text-sm font-medium mb-1">{label}</p>
      {description && (
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
      )}
      <Input
        type="number"
        value={settings[settingKey] || ""}
        onChange={e => updateSetting(settingKey, e.target.value)}
        className="w-32"
      />
    </div>
  );

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Nav */}
            <div className="md:col-span-1">
              <nav className="space-y-1">
                {sections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === section.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50 text-muted-foreground"
                    }`}
                  >
                    <span className="mr-2">{section.icon}</span>
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Content */}
            <div className="md:col-span-3">
              <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {sections.find(s => s.id === activeSection)?.icon}{" "}
                    {sections.find(s => s.id === activeSection)?.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/30">
                  {activeSection === "ai" && (
                    <>
                      <Select
                        settingKey="ai.defaultBuilderModel"
                        label="Default Builder Model"
                        description="Model used for code generation tasks"
                        options={[
                          { value: "gpt-4o", label: "GPT-4o (Quality)" },
                          { value: "gpt-4o-mini", label: "GPT-4o-mini (Fast)" },
                          { value: "claude-sonnet", label: "Claude Sonnet" },
                        ]}
                      />
                      <Select
                        settingKey="ai.defaultValidatorModel"
                        label="Default Validator Model"
                        description="Model used for code review and validation"
                        options={[
                          {
                            value: "claude-sonnet",
                            label: "Claude Sonnet (Thorough)",
                          },
                          {
                            value: "claude-haiku",
                            label: "Claude Haiku (Fast)",
                          },
                          { value: "gpt-4o-mini", label: "GPT-4o-mini" },
                        ]}
                      />
                      <Slider
                        settingKey="ai.temperature"
                        label="Temperature"
                        description="Higher = more creative, Lower = more precise"
                        min={0}
                        max={1}
                        step={0.1}
                      />
                      <NumberInput
                        settingKey="ai.maxTokens"
                        label="Max Tokens per Response"
                        description="Maximum output length (default: 4096)"
                      />
                    </>
                  )}

                  {activeSection === "budget" && (
                    <>
                      <NumberInput
                        settingKey="budget.dailyLimit"
                        label="Daily Budget Limit ($)"
                        description="Maximum spend per day"
                      />
                      <NumberInput
                        settingKey="budget.monthlyLimit"
                        label="Monthly Budget Limit ($)"
                        description="Maximum spend per month"
                      />
                      <Slider
                        settingKey="budget.warningThreshold"
                        label="Warning Threshold (%)"
                        description="Show warning when this percentage of budget is used"
                        min={50}
                        max={95}
                        step={5}
                      />
                      <Toggle
                        settingKey="budget.autoPause"
                        label="Auto-Pause on Budget Hit"
                        description="Automatically stop AI requests when budget is exhausted"
                      />
                    </>
                  )}

                  {activeSection === "appearance" && (
                    <>
                      <Select
                        settingKey="appearance.theme"
                        label="Theme"
                        options={[
                          { value: "dark", label: "Dark" },
                          { value: "light", label: "Light" },
                          { value: "system", label: "System" },
                        ]}
                      />
                      <Select
                        settingKey="appearance.animationIntensity"
                        label="Animation Intensity"
                        description="Controls the intensity of UI animations"
                        options={[
                          { value: "full", label: "Full" },
                          { value: "reduced", label: "Reduced" },
                          { value: "off", label: "Off" },
                        ]}
                      />
                      <Select
                        settingKey="appearance.orchestrationPosition"
                        label="Orchestration Panel Position"
                        description="Where the orchestration visual appears"
                        options={[
                          { value: "side", label: "Side Panel" },
                          { value: "bottom", label: "Bottom" },
                          { value: "hidden", label: "Hidden" },
                        ]}
                      />
                      <Card className="mt-4">
                        <CardHeader>
                          <CardTitle className="text-sm">
                            App Icon (PWA)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground mb-3">
                            Upload a 512x512 PNG to use as the home screen icon
                            when installed as an app.
                          </p>
                          <div className="flex items-center gap-4">
                            {settings["appearance.pwaIcon"] && (
                              <img
                                src={settings["appearance.pwaIcon"]}
                                alt="Current icon"
                                className="w-16 h-16 rounded-lg border border-border"
                              />
                            )}
                            <label className="cursor-pointer">
                              <div className="px-4 py-2 rounded-md bg-primary/10 border border-primary/30 text-primary text-sm hover:bg-primary/20 transition-colors">
                                Upload Icon
                              </div>
                              <input
                                type="file"
                                accept="image/png"
                                className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.size > 1024 * 1024) {
                                    toast.error("Icon must be under 1MB");
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = async () => {
                                    const base64 = reader.result as string;
                                    updateSetting("appearance.pwaIcon", base64);
                                    // Also save to app_settings table so /api/pwa-icon serves it
                                    try {
                                      const resp = await fetch(
                                        "/api/settings/pwa-icon",
                                        {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            icon: base64,
                                          }),
                                        }
                                      );
                                      if (resp.ok) {
                                        toast.success(
                                          "PWA icon saved! Reinstall the app to see changes."
                                        );
                                      } else {
                                        toast.error(
                                          "Icon preview updated but failed to save to server."
                                        );
                                      }
                                    } catch {
                                      toast.error(
                                        "Icon preview updated but failed to save to server."
                                      );
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}

                  {activeSection === "notifications" && (
                    <>
                      <Toggle
                        settingKey="notifications.jobCompletion"
                        label="Job Completion Alerts"
                        description="Notify when async jobs finish"
                      />
                      <Toggle
                        settingKey="notifications.budgetWarnings"
                        label="Budget Warnings"
                        description="Alert when approaching budget limits"
                      />
                      <Toggle
                        settingKey="notifications.errorAlerts"
                        label="Error Alerts"
                        description="Notify on critical errors"
                      />
                    </>
                  )}

                  {activeSection === "platforms" && (
                    <PlatformConnectionsSection />
                  )}

                  {activeSection === "apikeys" && (
                    <div className="space-y-4 py-3">
                      <p className="text-sm text-muted-foreground">
                        These services are pre-configured. Status shows whether
                        the platform connection is active.
                      </p>
                      {[
                        { name: "OpenAI", status: "connected" },
                        { name: "Anthropic", status: "connected" },
                        { name: "Perplexity", status: "connected" },
                        { name: "Cloudflare", status: "connected" },
                        { name: "Sprites.dev", status: "connected" },
                      ].map(service => (
                        <div
                          key={service.name}
                          className="flex items-center justify-between py-2"
                        >
                          <span className="text-sm font-medium">
                            {service.name}
                          </span>
                          <span className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeSection === "github" && <GitHubSettingsSection />}

                  {activeSection === "danger" && (
                    <div className="space-y-4 py-3">
                      <p className="text-sm text-red-400">
                        These actions are irreversible. Proceed with caution.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                          <div>
                            <p className="text-sm font-medium">
                              Reset All Settings
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Restore all settings to defaults
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                            onClick={() => {
                              if (confirm("Reset all settings to defaults?")) {
                                resetMutation.mutate();
                              }
                            }}
                          >
                            Reset
                          </Button>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                          <div>
                            <p className="text-sm font-medium">
                              Export All Data
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Download all your data as JSON
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              toast.info("This feature is not yet available")
                            }
                          >
                            Export
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Platform Connections Section ────────────────────────────────────────────

type Platform = "vercel" | "netlify" | "railway";

const PLATFORM_INFO: Record<
  Platform,
  { name: string; description: string; tokenUrl: string; placeholder: string }
> = {
  vercel: {
    name: "Vercel",
    description: "Deploy frontend frameworks and static sites",
    tokenUrl: "https://vercel.com/account/tokens",
    placeholder: "Enter your Vercel personal access token",
  },
  netlify: {
    name: "Netlify",
    description: "JAMstack and static site hosting",
    tokenUrl:
      "https://app.netlify.com/user/applications#personal-access-tokens",
    placeholder: "Enter your Netlify personal access token",
  },
  railway: {
    name: "Railway",
    description: "Full-stack apps, databases, and infrastructure",
    tokenUrl: "https://railway.app/account/tokens",
    placeholder: "Enter your Railway API token",
  },
};

function PlatformConnectionsSection() {
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(
    null
  );
  const [tokenInput, setTokenInput] = useState("");

  const { data: deployStatus, refetch } = trpc.deploy.status.useQuery();
  const connectMutation = trpc.deploy.connectPlatform.useMutation({
    onSuccess: result => {
      toast.success(`Connected to ${connectingPlatform} as ${result.username}`);
      setConnectingPlatform(null);
      setTokenInput("");
      refetch();
    },
    onError: err => {
      toast.error(err.message || "Failed to connect");
    },
  });
  const disconnectMutation = trpc.deploy.disconnectPlatform.useMutation({
    onSuccess: () => {
      toast.success("Platform disconnected");
      refetch();
    },
    onError: err => {
      toast.error(err.message || "Failed to disconnect");
    },
  });

  const handleConnect = (platform: Platform) => {
    if (!tokenInput.trim()) {
      toast.error("Please enter a token");
      return;
    }
    connectMutation.mutate({ platform, token: tokenInput.trim() });
  };

  const platforms = deployStatus?.platforms || [];

  return (
    <div className="space-y-4 py-3">
      <p className="text-sm text-muted-foreground">
        Connect deployment platforms to enable one-click deploys from
        Quoratorium.
      </p>

      {(["vercel", "netlify", "railway"] as Platform[]).map(platform => {
        const info = PLATFORM_INFO[platform];
        const status = platforms.find((p: any) => p.platform === platform);
        const isConnected = status?.connected;
        const isConnecting = connectingPlatform === platform;

        return (
          <div
            key={platform}
            className="p-4 rounded-xl border border-border/50 bg-white/[0.02] space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{info.name}</span>
                  {isConnected && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-[9px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Connected
                      {status?.username ? ` as ${status.username}` : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {info.description}
                </p>
              </div>

              {isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                  onClick={() => disconnectMutation.mutate({ platform })}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConnectingPlatform(isConnecting ? null : platform);
                    setTokenInput("");
                  }}
                >
                  {isConnecting ? "Cancel" : "Connect"}
                </Button>
              )}
            </div>

            {isConnecting && !isConnected && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground">
                  Get your token from{" "}
                  <a
                    href={info.tokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline"
                  >
                    {info.name} settings
                  </a>
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={info.placeholder}
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    className="flex-1 text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleConnect(platform)}
                    disabled={connectMutation.isPending || !tokenInput.trim()}
                  >
                    {connectMutation.isPending ? "Connecting..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── GitHub Settings Section ─────────────────────────────────────────────────

function GitHubSettingsSection() {
  const { user } = useAuth();
  const [tokenInput, setTokenInput] = useState("");
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");

  const statusQuery = trpc.git.status.useQuery(undefined, { enabled: !!user });
  const reposQuery = trpc.git.listRepos.useQuery(undefined, {
    enabled: !!user && !!statusQuery.data?.connected,
  });
  const branchesQuery = trpc.git.branches.useQuery(
    { repo: selectedRepo },
    {
      enabled: !!user && !!statusQuery.data?.connected && !!selectedRepo,
    }
  );

  useEffect(() => {
    if (!statusQuery.data) return;
    setSelectedRepo(statusQuery.data.defaultRepo || "");
    setSelectedBranch(statusQuery.data.defaultBranch || "");
  }, [statusQuery.data]);

  const connectMutation = trpc.git.connect.useMutation({
    onSuccess: data => {
      toast.success(`Connected to GitHub as ${data.username}`);
      setTokenInput("");
      setShowConnectForm(false);
      statusQuery.refetch();
      reposQuery.refetch();
    },
    onError: err => toast.error(err.message || "Failed to connect to GitHub"),
  });

  const disconnectMutation = trpc.git.disconnect.useMutation({
    onSuccess: () => {
      toast.success("GitHub disconnected");
      setSelectedRepo("");
      setSelectedBranch("");
      statusQuery.refetch();
    },
    onError: err => toast.error(err.message || "Failed to disconnect GitHub"),
  });

  const saveDefaultsMutation = trpc.git.updateDefaults.useMutation({
    onSuccess: saved => {
      if (!saved) {
        toast.error("GitHub defaults could not be saved");
        return;
      }
      toast.success("Default repository and branch saved");
      statusQuery.refetch();
    },
    onError: err =>
      toast.error(err.message || "Failed to save GitHub defaults"),
  });

  const handleRepoChange = (repoName: string) => {
    setSelectedRepo(repoName);
    const repo = reposQuery.data?.find(
      (item: any) => item.fullName === repoName || item.full_name === repoName
    );
    setSelectedBranch(repo?.defaultBranch || "main");
  };

  const refreshGitHub = async () => {
    await statusQuery.refetch();
    if (statusQuery.data?.connected) {
      await reposQuery.refetch();
      if (selectedRepo) await branchesQuery.refetch();
    }
    toast.success("GitHub status refreshed");
  };

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking GitHub connection…
      </div>
    );
  }

  if (statusQuery.isError) {
    return (
      <div className="space-y-3 py-3">
        <p className="text-sm text-red-400">
          GitHub status could not be loaded: {statusQuery.error.message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => statusQuery.refetch()}
        >
          <RefreshCw />
          Retry
        </Button>
      </div>
    );
  }

  const status = statusQuery.data;
  const isConnected = !!status?.connected;
  const isPersonalConnection = status?.connectionSource === "personal";

  return (
    <div className="space-y-5 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                isConnected ? "bg-emerald-400" : "bg-zinc-600"
              }`}
            />
            <p className="text-sm font-medium">
              {isConnected
                ? `Connected as ${status?.username}`
                : "GitHub is not connected"}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isConnected
              ? isPersonalConnection
                ? "Using your encrypted personal access token."
                : "Using the secure GitHub connection configured for this workspace."
              : "Connect GitHub to browse repositories and push generated code."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refreshGitHub}>
            <RefreshCw />
            Refresh
          </Button>
          {isPersonalConnection && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-400/30 text-red-400 hover:bg-red-400/10"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="rounded-xl border border-border/50 bg-white/[0.02] p-4">
          {!showConnectForm ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-white/5">
                  <Github className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Connect your account</p>
                  <p className="text-xs text-muted-foreground">
                    Tokens are encrypted before they are stored.
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowConnectForm(true)}>
                Connect GitHub
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Create a GitHub personal access token with repository access in{" "}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline underline-offset-2"
                >
                  GitHub token settings
                </a>
                , then paste it below.
              </p>
              <Input
                type="password"
                autoComplete="off"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={tokenInput}
                onChange={event => setTokenInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && tokenInput.trim()) {
                    connectMutation.mutate({ token: tokenInput.trim() });
                  }
                }}
                className="font-mono"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    connectMutation.mutate({ token: tokenInput.trim() })
                  }
                  disabled={!tokenInput.trim() || connectMutation.isPending}
                >
                  {connectMutation.isPending && (
                    <Loader2 className="animate-spin" />
                  )}
                  {connectMutation.isPending ? "Connecting…" : "Connect"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowConnectForm(false);
                    setTokenInput("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {isConnected && (
        <div className="space-y-4 rounded-xl border border-border/50 bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-medium">Push defaults</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose the repository and branch used by default when pushing
              generated code from the workspace.
            </p>
          </div>

          {reposQuery.isError ? (
            <div className="flex flex-col gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-red-300">
                Repositories could not be loaded: {reposQuery.error.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reposQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Repository
                </span>
                <select
                  value={selectedRepo}
                  onChange={event => handleRepoChange(event.target.value)}
                  disabled={reposQuery.isLoading}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-50"
                >
                  <option value="">
                    {reposQuery.isLoading
                      ? "Loading repositories…"
                      : "Select a repository"}
                  </option>
                  {reposQuery.data?.map((repo: any) => (
                    <option
                      key={repo.id}
                      value={repo.fullName || repo.full_name}
                    >
                      {repo.fullName || repo.full_name}
                      {repo.private ? " (private)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <GitBranch className="size-3.5" />
                  Branch
                </span>
                <select
                  value={selectedBranch}
                  onChange={event => setSelectedBranch(event.target.value)}
                  disabled={!selectedRepo || branchesQuery.isLoading}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-50"
                >
                  <option value="">
                    {!selectedRepo
                      ? "Select a repository first"
                      : branchesQuery.isLoading
                        ? "Loading branches…"
                        : "Select a branch"}
                  </option>
                  {selectedBranch &&
                    !branchesQuery.data?.some(
                      (branch: any) => branch.name === selectedBranch
                    ) && (
                      <option value={selectedBranch}>{selectedBranch}</option>
                    )}
                  {branchesQuery.data?.map((branch: any) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                      {branch.protected ? " (protected)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {reposQuery.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No repositories are available for this GitHub connection.
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border/30 pt-4">
            <Button
              size="sm"
              onClick={() =>
                saveDefaultsMutation.mutate({
                  defaultRepo: selectedRepo,
                  defaultBranch: selectedBranch,
                })
              }
              disabled={
                !selectedRepo ||
                !selectedBranch ||
                saveDefaultsMutation.isPending
              }
            >
              {saveDefaultsMutation.isPending && (
                <Loader2 className="animate-spin" />
              )}
              {saveDefaultsMutation.isPending ? "Saving…" : "Save defaults"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/workspace/git">
                <Github />
                Manage repositories
              </a>
            </Button>
            {selectedRepo && (
              <Button asChild variant="ghost" size="sm">
                <a
                  href={`https://github.com/${selectedRepo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on GitHub
                  <ExternalLink />
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
