import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const TOOLS = new Set(["templatorium", "extractorium"]);

export default function ToolLaunch() {
  const [location, setLocation] = useLocation();
  const started = useRef(false);
  const launch = trpc.auth.toolLaunch.useMutation();
  const tool = useMemo(() => location.split("/").pop() ?? "", [location]);

  useEffect(() => {
    if (!TOOLS.has(tool)) {
      setLocation("/workspace/launchpad", { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;

    launch.mutate(
      { tool: tool as "templatorium" | "extractorium" },
      {
        onSuccess: ({ url }) => window.location.replace(url),
        onError: error => {
          toast.error("Tool launch unavailable", {
            description: error.message,
          });
          window.setTimeout(
            () => setLocation("/workspace/launchpad", { replace: true }),
            1200
          );
        },
      }
    );
  }, [launch, setLocation, tool]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div>
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          Opening your tool
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifying your Quoratorium session securely…
        </p>
      </div>
    </main>
  );
}
