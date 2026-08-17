/**
 * Q Workspace — Application Root
 * Landing page at /, workspace at /workspace/*
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
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
import SharedProject from "./pages/SharedProject";
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
      <Route path="/workspace/launchpad" component={Launchpad} />
      <Route path="/workspace/settings" component={Settings} />

      {/* Legacy routes */}
      <Route path="/projects" component={Projects} />
      <Route path="/vault" component={Vault} />
      <Route path="/launchpad" component={Launchpad} />
      <Route path="/settings" component={Settings} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <PasswordGate>
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
            <SettingsInitializer />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </PasswordGate>
  );
}

export default App;
// Build: 1786613772
