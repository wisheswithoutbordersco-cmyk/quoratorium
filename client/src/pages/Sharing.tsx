import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";

export default function Sharing() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"shared" | "export">("shared");

  const sharedQuery = trpc.sharing.listShared.useQuery(undefined, { enabled: !!user });
  const revokeMutation = trpc.sharing.revokeShareLink.useMutation({
    onSuccess: () => {
      toast.success("Share link has been revoked");
      sharedQuery.refetch();
    },
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/shared/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard");
  };

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Export & Sharing</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Share projects publicly and export conversations
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-zinc-900/50 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab("shared")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                activeTab === "shared" ? "bg-zinc-700 text-white" : "text-muted-foreground hover:text-white"
              }`}
            >
              Shared Links
            </button>
            <button
              onClick={() => setActiveTab("export")}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                activeTab === "export" ? "bg-zinc-700 text-white" : "text-muted-foreground hover:text-white"
              }`}
            >
              Export
            </button>
          </div>

          {/* Shared Links Tab */}
          {activeTab === "shared" && (
            <div className="space-y-4">
              {sharedQuery.data && sharedQuery.data.length > 0 ? (
                sharedQuery.data.map((shared: any) => (
                  <Card key={shared.id} className="border-border/50 bg-card/50 backdrop-blur">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium truncate">{shared.title || "Untitled"}</h3>
                          {shared.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {shared.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-muted-foreground">
                              {shared.viewCount} views
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Created {new Date(shared.createdAt).toLocaleDateString()}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              shared.isActive
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}>
                              {shared.isActive ? "Active" : "Revoked"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          {shared.isActive && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyLink(shared.slug)}
                              >
                                Copy Link
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                                onClick={() => revokeMutation.mutate({ id: shared.id })}
                              >
                                Revoke
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-border/50 bg-card/50 backdrop-blur">
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground text-sm">No shared projects yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share a project from the Projects page to create a public link
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Export Tab */}
          {activeTab === "export" && (
            <div className="space-y-4">
              <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-base">Export Conversations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Export your conversations as Markdown files. Use the export button in the conversation header
                    or select a conversation below.
                  </p>
                  <ExportConversationList />
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-base">Export Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Download project code as a ZIP file. Use the download button on each project card
                    or from the project view.
                  </p>
                  <ExportProjectList />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportConversationList() {

  const conversationsQuery = trpc.conversations.list.useQuery(undefined);

  const handleExport = async (conversationId: number, title: string) => {
    try {
      // We'll use a direct fetch to get the markdown
      const res = await fetch(`/api/trpc/sharing.exportConversation?input=${encodeURIComponent(JSON.stringify({ conversationId }))}`);
      const data = await res.json();
      const markdown = data?.result?.data?.markdown;
      if (!markdown) {
        toast.error("Could not export conversation");
        return;
      }
      // Download as file
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "conversation"}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${title} exported as Markdown`);
    } catch {
      toast.error("Export failed");
    }
  };

  if (!conversationsQuery.data || conversationsQuery.data.length === 0) {
    return <p className="text-xs text-muted-foreground">No conversations to export</p>;
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {conversationsQuery.data.map((convo: any) => (
        <div
          key={convo.id}
          className="flex items-center justify-between p-3 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{convo.title || "Untitled"}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(convo.updatedAt || convo.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExport(convo.id, convo.title)}
          >
            Export MD
          </Button>
        </div>
      ))}
    </div>
  );
}

function ExportProjectList() {

  const projectsQuery = trpc.projects.list.useQuery(undefined);

  if (!projectsQuery.data || projectsQuery.data.length === 0) {
    return <p className="text-xs text-muted-foreground">No projects to export</p>;
  }

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {projectsQuery.data.map((project: any) => (
        <div
          key={project.id}
          className="flex items-center justify-between p-3 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground">
              {project.stack || "No stack specified"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.info("ZIP export will be available soon")}
          >
            Download ZIP
          </Button>
        </div>
      ))}
    </div>
  );
}
