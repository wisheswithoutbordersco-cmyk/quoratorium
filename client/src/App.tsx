/**
 * Q Workspace — Application Root
 * Landing page at /, workspace at /workspace/*
 */
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Redirect, Route, Switch } from "wouter";
import Launchpad from "./pages/Launchpad";
import ErrorBoundary from "./components/ErrorBoundary";
import { SettingsInitializer } from "./components/SettingsInitializer";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PasswordGate } from "./components/PasswordGate";

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
import ActionCatalog from "./pages/ActionCatalog";
import ToolLaunch from "./pages/ToolLaunch";

const TEMPLATORIUM_URL = "https://templatorium-production.up.railway.app/";

function TemplatoriumRedirect() {
  useEffect(() => {
    window.location.replace(TEMPLATORIUM_URL);
  }, []);
  return null;
}

function WorkspaceRouter() {
  return (
    <Switch>
      {/* Workspace routes */}
      <Route path="/workspace" component={Home} />
      <Route path="/workspace/projects" component={Projects} />
      <Route path="/workspace/vault" component={Vault} />
      <Route path="/workspace/launchpad" component={Launchpad} />
      <Route path="/workspace/launch/:tool" component={ToolLaunch} />
      <Route path="/workspace/git" component={Git} />
      <Route path="/workspace/actions" component={ActionCatalog} />
      {/* Compatibility for stale/relative links; Templatorium is external. */}
      <Route path="/workspace/templatorium" component={TemplatoriumRedirect} />
      <Route path="/workspace/settings" component={Settings} />
      <Route path="/workspace/recyclatorium" component={Recyclatorium} />

      {/* These legacy workspace surfaces were intentionally retired. */}
      <Route path="/workspace/analytics">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/billing">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/builders">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/costs">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/deployments">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/jobs">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/knowledge">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/memory">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/observability">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/profile">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/security">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/sharing">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/workspace/templates">
        <Redirect to="/workspace" replace />
      </Route>

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
      <Route path="/actions">
        <Redirect to="/workspace/actions" replace />
      </Route>
      <Route path="/settings">
        <Redirect to="/workspace/settings" replace />
      </Route>
      <Route path="/templatorium" component={TemplatoriumRedirect} />
      <Route path="/analytics">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/billing">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/builders">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/costs">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/deployments">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/jobs">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/knowledge">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/memory">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/observability">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/profile">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/security">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/sharing">
        <Redirect to="/workspace" replace />
      </Route>
      <Route path="/templates">
        <Redirect to="/workspace" replace />
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
