/**
 * Q Workspace — Application Root
 * Landing page at /, private workspace at /workspace/*
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { OwnerGate } from "./components/OwnerGate";
import { SettingsInitializer } from "./components/SettingsInitializer";
import { ThemeProvider } from "./contexts/ThemeContext";
import LandingPage from "./pages/LandingPage";
import Home from "./pages/Home";
import Launchpad from "./pages/Launchpad";
import NotFound from "./pages/NotFound";
import Projects from "./pages/Projects";
import Settings from "./pages/Settings";
import SharedProject from "./pages/SharedProject";
import Vault from "./pages/Vault";

function PrivateWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <OwnerGate>
      <SettingsInitializer />
      {children}
    </OwnerGate>
  );
}

function WorkspaceHome() {
  return <PrivateWorkspace><Home /></PrivateWorkspace>;
}
function WorkspaceProjects() {
  return <PrivateWorkspace><Projects /></PrivateWorkspace>;
}
function WorkspaceVault() {
  return <PrivateWorkspace><Vault /></PrivateWorkspace>;
}
function WorkspaceLaunchpad() {
  return <PrivateWorkspace><Launchpad /></PrivateWorkspace>;
}
function WorkspaceSettings() {
  return <PrivateWorkspace><Settings /></PrivateWorkspace>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/shared/:slug" component={SharedProject} />

      <Route path="/workspace" component={WorkspaceHome} />
      <Route path="/workspace/projects" component={WorkspaceProjects} />
      <Route path="/workspace/vault" component={WorkspaceVault} />
      <Route path="/workspace/launchpad" component={WorkspaceLaunchpad} />
      <Route path="/workspace/settings" component={WorkspaceSettings} />

      <Route path="/projects" component={WorkspaceProjects} />
      <Route path="/vault" component={WorkspaceVault} />
      <Route path="/launchpad" component={WorkspaceLaunchpad} />
      <Route path="/settings" component={WorkspaceSettings} />

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
                background: "#050505",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#F0F0F5",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
// Build: 1786613772
