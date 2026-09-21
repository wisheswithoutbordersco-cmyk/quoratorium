/**
 * Q Workspace — Application Root
 * Landing page at /, workspace at /workspace/*
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Switch } from "wouter";
import Launchpad from "./pages/Launchpad";
import ErrorBoundary from "./components/ErrorBoundary";
import { SettingsInitializer } from "./components/SettingsInitializer";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PasswordGate } from "./components/PasswordGate";
import { useAuth } from "./_core/hooks/useAuth";

// Landing Page
import LandingPage from "./pages/LandingPage";

// Workspace Pages
import Home from "./pages/Home";
import Projects from "./pages/Projects";
import Vault from "./pages/Vault";
import Settings from "./pages/Settings";
import Git from "./pages/Git";
import SharedProject from "./pages/SharedProject";
import NotFound from "./pages/NotFound";
import Recyclatorium from "./pages/Recyclatorium";
import Analytics from "./pages/Analytics";
import Billing from "./pages/Billing";
import Builders from "./pages/Builders";
import Costs from "./pages/Costs";
import Deployments from "./pages/Deployments";
import Jobs from "./pages/Jobs";
import Knowledge from "./pages/Knowledge";
import Memory from "./pages/Memory";
import Observability from "./pages/Observability";
import Profile from "./pages/Profile";
import Security from "./pages/Security";
import Sharing from "./pages/Sharing";
import Templates from "./pages/Templates";

function AdminWorkspaceRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user?.role !== "admin") return <Redirect to="/workspace" replace />;
  return <Component />;
}

function WorkspaceRouter() {
  return (
    <Switch>
      {/* Workspace routes */}
      <Route path="/workspace" component={Home} />
      <Route path="/workspace/projects" component={Projects} />
      <Route path="/workspace/vault" component={Vault} />
      <Route path="/workspace/launchpad" component={Launchpad} />
      <Route path="/workspace/git" component={Git} />
      <Route path="/workspace/settings" component={Settings} />
      <Route path="/workspace/analytics">
        <AdminWorkspaceRoute component={Analytics} />
      </Route>
      <Route path="/workspace/billing" component={Billing} />
      <Route path="/workspace/builders">
        <AdminWorkspaceRoute component={Builders} />
      </Route>
      <Route path="/workspace/costs">
        <AdminWorkspaceRoute component={Costs} />
      </Route>
      <Route path="/workspace/deployments">
        <AdminWorkspaceRoute component={Deployments} />
      </Route>
      <Route path="/workspace/jobs">
        <AdminWorkspaceRoute component={Jobs} />
      </Route>
      <Route path="/workspace/knowledge" component={Knowledge} />
      <Route path="/workspace/memory" component={Memory} />
      <Route path="/workspace/observability">
        <AdminWorkspaceRoute component={Observability} />
      </Route>
      <Route path="/workspace/profile" component={Profile} />
      <Route path="/workspace/security">
        <AdminWorkspaceRoute component={Security} />
      </Route>
      <Route path="/workspace/sharing" component={Sharing} />
      <Route path="/workspace/templates" component={Templates} />
      <Route path="/workspace/recyclatorium" component={Recyclatorium} />

      {/* Legacy aliases redirect to canonical workspace routes. */}
      <Route path="/projects">
        <Redirect to="/workspace/projects" replace />
      </Route>
      <Route path="/vault">
        <Redirect to="/workspace/vault" replace />
      </Route>
      <Route path="/launchpad">
        <Redirect to="/workspace/launchpad" replace />
      </Route>
      <Route path="/git">
        <Redirect to="/workspace/git" replace />
      </Route>
      <Route path="/settings">
        <Redirect to="/workspace/settings" replace />
      </Route>
      <Route path="/analytics">
        <Redirect to="/workspace/analytics" replace />
      </Route>
      <Route path="/billing">
        <Redirect to="/workspace/billing" replace />
      </Route>
      <Route path="/builders">
        <Redirect to="/workspace/builders" replace />
      </Route>
      <Route path="/costs">
        <Redirect to="/workspace/costs" replace />
      </Route>
      <Route path="/deployments">
        <Redirect to="/workspace/deployments" replace />
      </Route>
      <Route path="/jobs">
        <Redirect to="/workspace/jobs" replace />
      </Route>
      <Route path="/knowledge">
        <Redirect to="/workspace/knowledge" replace />
      </Route>
      <Route path="/memory">
        <Redirect to="/workspace/memory" replace />
      </Route>
      <Route path="/observability">
        <Redirect to="/workspace/observability" replace />
      </Route>
      <Route path="/profile">
        <Redirect to="/workspace/profile" replace />
      </Route>
      <Route path="/security">
        <Redirect to="/workspace/security" replace />
      </Route>
      <Route path="/sharing">
        <Redirect to="/workspace/sharing" replace />
      </Route>
      <Route path="/templates">
        <Redirect to="/workspace/templates" replace />
      </Route>
      <Route path="/recyclatorium">
        <Redirect to="/workspace/recyclatorium" replace />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/shared/:slug" component={SharedProject} />
      <Route>
        <PasswordGate>
          <WorkspaceRouter />
        </PasswordGate>
      </Route>
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
                background: "#0b0704",
                border: "1px solid rgba(242,140,56,0.18)",
                color: "#f7efe9",
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
// Build: 1786613772
