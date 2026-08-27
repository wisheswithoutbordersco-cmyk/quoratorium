import * as Sentry from "@sentry/react";

// Initialize Sentry before anything else
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  environment: import.meta.env.MODE || "production",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    if (error instanceof TRPCClientError) {
      Sentry.captureException(error);
      console.error("[API Query Error]", error);
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (error instanceof TRPCClientError) {
      Sentry.captureException(error);
      console.error("[API Mutation Error]", error);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

function mountApp() {
  // Guard: ensure root element exists before mounting
  let rootEl = document.getElementById("root");
  if (!rootEl) {
    // Fallback: create the root element if it's missing (e.g., browser extension interference)
    rootEl = document.createElement("div");
    rootEl.id = "root";
    document.body.appendChild(rootEl);
    Sentry.captureMessage("Root element missing — created fallback", "warning");
  }

  createRoot(rootEl).render(
    <Sentry.ErrorBoundary
      fallback={({ error }) => (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-muted-foreground">An unexpected error occurred. Our team has been notified.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}
    >
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </trpc.Provider>
    </Sentry.ErrorBoundary>
  );
}

// Mount immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp);
} else {
  mountApp();
}
