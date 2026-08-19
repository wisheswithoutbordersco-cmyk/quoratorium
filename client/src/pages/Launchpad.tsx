/**
 * Launchpad — Quick-access grid to all ecosystem apps
 */
import { motion } from "framer-motion";
import { TopNav } from "@/components/TopNav";
import { ExternalLink } from "lucide-react";

const apps = [
  {
    name: "Scriptorium",
    letter: "S",
    description: "AI Image Generator — Create print-ready art and PDFs",
    url: "https://app.scriptoriumdesign.com",
    color: "#1a1a2e",
  },
  {
    name: "Templatorium",
    letter: "T",
    description: "Template Editor — Upload, edit text, export clean PDFs",
    url: "https://templatorium-production.up.railway.app",
    color: "#2d2d44",
  },
  {
    name: "Extractorium",
    letter: "E",
    description: "Vision & OCR — Reverse-prompt images, extract text",
    url: "https://extractorium-production.up.railway.app",
    color: "#1a1a2e",
  },
  {
    name: "Colloquiorium",
    letter: "C",
    description: "AI Boardroom — Multi-AI advisory conversations",
    url: "https://colloquiorium-production.up.railway.app",
    color: "#2d2d44",
  },
  {
    name: "Deployorium",
    letter: "D",
    description: "Zip Deployer — Drag & drop to Cloudflare Pages",
    url: "https://deployorium-production.up.railway.app",
    color: "#1a1a2e",
  },
  {
    name: "Repositorium",
    letter: "R",
    description: "Credential Vault — Secure storage for keys & files",
    url: "https://repositorium-production.up.railway.app",
    color: "#2d2d44",
  },
];

export default function Launchpad() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-3xl font-bold text-foreground mb-2">Launchpad</h1>
          <p className="text-muted-foreground mb-8">
            Your ecosystem at a glance. One click to any tool.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app, i) => (
              <motion.a
                key={app.name}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="group relative flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold text-silver-200 border border-zinc-600/50 shadow-inner"
                    style={{ backgroundColor: app.color }}
                  >
                    {app.letter}
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {app.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {app.description}
                  </p>
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
