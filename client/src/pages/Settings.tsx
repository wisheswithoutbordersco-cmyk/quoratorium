import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";
import { useSettingsStore } from "@/stores/settingsStore";

type SettingsMap = Record<string, string>;

export default function Settings() {
  const { user } = useAuth();

  const [settings, setSettings] = useState<SettingsMap>({});
  const [activeSection, setActiveSection] = useState("ai");
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const settingsQuery = trpc.settings.getAll.useQuery(undefined, { enabled: !!user });
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => toast.success("Settings updated"),
    onError: (err) => toast.error(err.message),
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

  const globalUpdateSetting = useSettingsStore((s) => s.updateSetting);

  const updateSetting = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    // Update global store immediately (optimistic)
    globalUpdateSetting(key, value);
    if (saveTimeout) clearTimeout(saveTimeout);
    const timeout = setTimeout(() => {
      updateMutation.mutate({ settings: { [key]: value } });
    }, 800);
    setSaveTimeout(timeout);
  }, [saveTimeout, updateMutation, globalUpdateSetting]);

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

  const Toggle = ({ settingKey, label, description }: { settingKey: string; label: string; description?: string }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => updateSetting(settingKey, settings[settingKey] === "true" ? "false" : "true")}
        className={`w-11 h-6 rounded-full transition-colors relative ${
          settings[settingKey] === "true" ? "bg-blue-500" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            settings[settingKey] === "true" ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );

  const Select = ({ settingKey, label, options, description }: { settingKey: string; label: string; options: { value: string; label: string }[]; description?: string }) => (
    <div className="py-3">
      <p className="text-sm font-medium mb-1">{label}</p>
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
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

  const Slider = ({ settingKey, label, min, max, step, description }: { settingKey: string; label: string; min: number; max: number; step: number; description?: string }) => (
    <div className="py-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">{label}</p>
        <span className="text-sm text-muted-foreground font-mono">{settings[settingKey] || min}</span>
      </div>
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={parseFloat(settings[settingKey] || String(min))}
        onChange={(e) => updateSetting(settingKey, e.target.value)}
        className="w-full accent-blue-500"
      />
    </div>
  );

  const NumberInput = ({ settingKey, label, description }: { settingKey: string; label: string; description?: string }) => (
    <div className="py-3">
      <p className="text-sm font-medium mb-1">{label}</p>
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <Input
        type="number"
        value={settings[settingKey] || ""}
        onChange={(e) => updateSetting(settingKey, e.target.value)}
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
                {sections.map((section) => (
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
                    {sections.find((s) => s.id === activeSection)?.icon}{" "}
                    {sections.find((s) => s.id === activeSection)?.label}
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
                          { value: "claude-sonnet", label: "Claude Sonnet (Thorough)" },
                          { value: "claude-haiku", label: "Claude Haiku (Fast)" },
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
                        These services are pre-configured. Status shows whether the platform connection is active.
                      </p>
                      {[
                        { name: "OpenAI", status: "connected" },
                        { name: "Anthropic", status: "connected" },
                        { name: "Perplexity", status: "connected" },
                        { name: "Cloudflare", status: "connected" },
                        { name: "Sprites.dev", status: "connected" },
                      ].map((service) => (
                        <div key={service.name} className="flex items-center justify-between py-2">
                          <span className="text-sm font-medium">{service.name}</span>
                          <span className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeSection === "github" && (
                    <div className="py-3">
                      <p className="text-sm text-muted-foreground mb-4">
                        Manage your GitHub connection here. Repository push and branch
                        selection are available directly from the workspace.
                      </p>
                    </div>
                  )}

                  {activeSection === "danger" && (
                    <div className="space-y-4 py-3">
                      <p className="text-sm text-red-400">
                        These actions are irreversible. Proceed with caution.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                          <div>
                            <p className="text-sm font-medium">Reset All Settings</p>
                            <p className="text-xs text-muted-foreground">Restore all settings to defaults</p>
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
                            <p className="text-sm font-medium">Export All Data</p>
                            <p className="text-xs text-muted-foreground">Download all your data as JSON</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toast.info("This feature is not yet available")}
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

const PLATFORM_INFO: Record<Platform, { name: string; description: string; tokenUrl: string; placeholder: string }> = {
  vercel: {
    name: "Vercel",
    description: "Deploy frontend frameworks and static sites",
    tokenUrl: "https://vercel.com/account/tokens",
    placeholder: "Enter your Vercel personal access token",
  },
  netlify: {
    name: "Netlify",
    description: "JAMstack and static site hosting",
    tokenUrl: "https://app.netlify.com/user/applications#personal-access-tokens",
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
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [tokenInput, setTokenInput] = useState("");

  const { data: deployStatus, refetch } = trpc.deploy.status.useQuery();
  const connectMutation = trpc.deploy.connectPlatform.useMutation({
    onSuccess: (result) => {
      toast.success(`Connected to ${connectingPlatform} as ${result.username}`);
      setConnectingPlatform(null);
      setTokenInput("");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to connect");
    },
  });
  const disconnectMutation = trpc.deploy.disconnectPlatform.useMutation({
    onSuccess: () => {
      toast.success("Platform disconnected");
      refetch();
    },
    onError: (err) => {
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
        Connect deployment platforms to enable one-click deploys from Quoratorium.
      </p>

      {(["vercel", "netlify", "railway"] as Platform[]).map((platform) => {
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
                      Connected{status?.username ? ` as ${status.username}` : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
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
                  <a href={info.tokenUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                    {info.name} settings
                  </a>
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={info.placeholder}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
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
