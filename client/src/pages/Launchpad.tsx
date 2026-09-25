/**
 * Launchpad — Quick-access grid to all ecosystem apps
 */
import { motion } from "framer-motion";
import { TopNav } from "@/components/TopNav";
import { ExternalLink, LockKeyhole } from "lucide-react";

const apps = [
  {
    name: "Scriptorium",
    letter: "S",
    description: "AI Image Generator — Create print-ready art and PDFs",
    url: "https://app.scriptoriumdesign.com",
  },
  {
    name: "Templatorium",
    letter: "T",
    description: "Template Editor — Upload, edit text, export clean PDFs",
    url: "/workspace/launch/templatorium",
  },
  {
    name: "Extractorium",
    letter: "E",
    description: "Vision & OCR — Reverse-prompt images, extract text",
    url: "/workspace/launch/extractorium",
  },
  {
    name: "Colloquiorium",
    letter: "C",
    description: "AI Boardroom — Multi-AI advisory conversations",
    url: "https://colloquiorium-production.up.railway.app",
  },
  {
    name: "Deployorium",
    letter: "D",
    description: "Zip Deployer — Drag & drop to Cloudflare Pages",
    url: "https://deployorium-production.up.railway.app",
  },
  {
    name: "Repositorium",
    letter: "R",
    description: "Credential Vault — Secure storage for keys & files",
    url: "https://repositorium-production.up.railway.app",
  },
  {
    name: "Recyclatorium",
    letter: "R",
    description:
      "Asset Lab — Analyze, recombine, transform, and package creative assets",
    url: "/recyclatorium",
    ownerOnly: true,
    status: "Integrated product builder",
  },
];

export default function Launchpad() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="max-w-5xl mx-auto px-5 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground sm:text-[2.625rem]">
            Launchpad
          </h1>
          <p className="mb-9 text-lg leading-8 text-muted-foreground sm:text-xl">
            Your ecosystem at a glance. One click to any tool.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app, i) => (
              <motion.a
                key={app.name}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-primary/45 bg-[#0d0704] text-2xl font-bold text-[#f08a37] shadow-[inset_0_1px_rgba(255,190,126,0.08),0_0_24px_rgba(216,102,24,0.12)] transition-colors duration-200 group-hover:border-primary/70 group-hover:bg-[#160b06] group-hover:text-[#ffad66]">
                    {app.letter}
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold leading-tight text-foreground lg:text-[1.375rem]">
                      {app.name}
                    </h3>
                    {app.ownerOnly && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                        <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                        Owner only
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-base leading-7 text-muted-foreground lg:text-[1.0625rem]">
                    {app.description}
                  </p>
                  {app.status && (
                    <p className="mt-3 text-sm font-medium leading-6 text-muted-foreground/70">
                      {app.status}
                    </p>
                  )}
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
