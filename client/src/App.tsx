/**
 * Q Workspace — Application Root
 * Landing page at /, workspace at /workspace/*
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { SettingsInitializer } from "./components/SettingsInitializer";
import { ThemeProvider } from "./contexts/ThemeContext";

// Landing Page
import LandingPage from "./pages/LandingPage";

// Workspace Pages
import Home from "./pages/Home";
import Projects from "./pages/Projects";
import Vault from "./pages/Vault";
import Analytics from "./pages/Analytics";
import Memory from "./pages/Memory";
import Builders from "./pages/Builders";
import Deployments from "./pages/Deployments";
import Settings from "./pages/Settings";
import Templates from "./pages/Templates";
import Jobs from "./pages/Jobs";
import Costs from "./pages/Costs";
import Observability from "./pages/Observability";
import Security from "./pages/Security";
import Profile from "./pages/Profile";
import Knowledge from "./pages/Knowledge";
import Git from "./pages/Git";
import Sharing from "./pages/Sharing";
import SharedProject from "./pages/SharedProject";
import Billing from "./pages/Billing";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <Switch>
      {/* Public landing page */}
      <Route path="/" component={LandingPage} />
      <Route path="/shared/:slug" component={SharedProject} />

      {/* Workspace routes */}
      <Route path="/workspace" component={Home} />
      <Route path="/workspace/projects" component={Projects} />
      <Route path="/workspace/vault" component={Vault} />
      <Route path="/workspace/analytics" component={Analytics} />
      <Route path="/workspace/memory" component={Memory} />
      <Route path="/workspace/builders" component={Builders} />
      <Route path="/workspace/deployments" component={Deployments} />
      <Route path="/workspace/settings" component={Settings} />
      <Route path="/workspace/templates" component={Templates} />
      <Route path="/workspace/jobs" component={Jobs} />
      <Route path="/workspace/costs" component={Costs} />
      <Route path="/workspace/observability" component={Observability} />
      <Route path="/workspace/security" component={Security} />
      <Route path="/workspace/profile" component={Profile} />
      <Route path="/workspace/knowledge" component={Knowledge} />
      <Route path="/workspace/git" component={Git} />
      <Route path="/workspace/sharing" component={Sharing} />
      <Route path="/workspace/billing" component={Billing} />

      {/* Legacy routes redirect to workspace */}
      <Route path="/projects" component={Projects} />
      <Route path="/vault" component={Vault} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/memory" component={Memory} />
      <Route path="/builders" component={Builders} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/settings" component={Settings} />
      <Route path="/templates" component={Templates} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/costs" component={Costs} />
      <Route path="/observability" component={Observability} />
      <Route path="/security" component={Security} />
      <Route path="/profile" component={Profile} />
      <Route path="/knowledge" component={Knowledge} />
      <Route path="/git" component={Git} />
      <Route path="/sharing" component={Sharing} />
      <Route path="/billing" component={Billing} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#12121A",
                border: "1px solid #1E1E2A",
                color: "#F0F0F5",
              },
            }}
          />
          <SettingsInitializer />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
