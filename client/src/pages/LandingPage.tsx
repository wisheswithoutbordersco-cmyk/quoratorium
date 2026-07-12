/**
 * Quoratorium Landing Page
 * Full hyper-black monochrome aesthetic with sharp edges and glass tiles
 */
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Zap, CheckCircle2, Github, Twitter, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { HyperBlackQSmall, HyperBlackQHero } from "@/components/HyperBlackQ";

// Matrix rain background component
function MatrixBackground() {
  const [chars, setChars] = useState<Array<{ id: string; x: number; y: number; char: string; opacity: number }>>([]);

  useEffect(() => {
    const matrix = "01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
    const newChars = Array.from({ length: 80 }, (_, i) => ({
      id: `${i}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      char: matrix[Math.floor(Math.random() * matrix.length)],
      opacity: Math.random() * 0.15 + 0.02,
    }));
    setChars(newChars);

    const interval = setInterval(() => {
      setChars((prev) =>
        prev.map((c) => ({
          ...c,
          y: (c.y + Math.random() * 2 - 1) % 100,
          char: matrix[Math.floor(Math.random() * matrix.length)],
          opacity: Math.random() * 0.15 + 0.02,
        }))
      );
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
      {chars.map((c) => (
        <div
          key={c.id}
          className="absolute font-mono text-[10px] text-emerald-900/40"
          style={{
            left: `${c.x}%`,
            top: `${c.y}%`,
            opacity: c.opacity,
            textShadow: "0 0 8px rgba(16, 185, 129, 0.15)",
          }}
        >
          {c.char}
        </div>
      ))}
    </div>
  );
}

// Glass tile component with sharp edges
function GlassTile({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-none overflow-hidden group hover:border-white/[0.12] transition-all duration-300 ${className}`}
      style={{
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.03)",
      }}
    >
      {/* Subtle glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent" />
      </div>
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <MatrixBackground />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-black/50 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HyperBlackQSmall className="w-8 h-8" />
            <span className="font-display text-sm tracking-widest text-white/90 uppercase hidden sm:inline">
              Quoratorium
            </span>
          </div>
          <Link href="/workspace" className="px-4 py-2 rounded-none bg-white/[0.05] border border-white/[0.1] text-white text-xs font-medium hover:bg-white/[0.08] transition-colors">
            Enter Workspace
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tight mb-6 leading-tight">
              <span className="text-white/90">The AI That</span>
              <br />
              <span className="bg-gradient-to-r from-white via-gray-300 to-white bg-clip-text text-transparent">
                Builds For You
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-white/60 mb-8 max-w-2xl mx-auto leading-relaxed">
              Captain Q orchestrates a neural network of specialized AI agents — Builder, Validator, Researcher — to generate, validate, and deploy real applications in seconds.
            </p>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-16"
            >
              <Link
                href="/workspace"
                className="px-8 py-4 rounded-none bg-white text-black font-medium text-sm hover:bg-white/90 transition-all duration-300 flex items-center justify-center gap-2 group"
              >
                Try It Free
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <button className="px-8 py-4 rounded-none bg-white/[0.05] border border-white/[0.1] text-white font-medium text-sm hover:bg-white/[0.08] transition-all duration-300">
                Watch Demo
              </button>
            </motion.div>

            {/* Hero graphic — animated Q logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="relative h-64 sm:h-80 flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-transparent rounded-full blur-3xl" />
              <div className="relative w-48 h-48 rounded-full border border-white/[0.08] flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-white/[0.05] animate-pulse" />
                <HyperBlackQHero className="w-40 h-40" />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* What It Does Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mb-4 text-white/90">
              Multi-AI Orchestration
            </h2>
            <p className="text-lg text-white/60 max-w-2xl">
              Instead of switching between tools, Captain Q coordinates a team of specialized AI agents working in parallel to deliver production-ready code.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "Q",
                title: "Captain Q",
                description: "Orchestrates all agents, breaks down complex tasks into steps, and ensures quality at every stage.",
              },
              {
                icon: "⚡",
                title: "Builder Agent",
                description: "Generates production-ready code in React, Node.js, Python, and more using advanced AI models.",
              },
              {
                icon: "✓",
                title: "Validator Agent",
                description: "Reviews generated code for correctness, security, and best practices using Claude.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
              >
                <GlassTile className="h-full p-6">
                  <div className="w-12 h-12 rounded-none bg-white/[0.08] border border-white/[0.1] p-2.5 mb-4 flex items-center justify-center text-white/80 font-display text-lg">
                    {item.icon}
                  </div>
                  <h3 className="font-display text-lg mb-2 text-white/90">{item.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{item.description}</p>
                </GlassTile>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mb-4 text-white/90">
              How It Works
            </h2>
            <p className="text-lg text-white/60 max-w-2xl">
              From idea to deployed application in three simple steps.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Describe",
                description: "Tell Captain Q what you want to build. Be as specific or vague as you like.",
              },
              {
                step: "2",
                title: "Build",
                description: "Captain Q coordinates agents to generate, validate, and refine your code in real-time.",
              },
              {
                step: "3",
                title: "Deploy",
                description: "One-click deployment to Vercel, Netlify, or Railway. Your app is live instantly.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                className="relative"
              >
                <GlassTile className="p-8">
                  <div className="w-12 h-12 rounded-none bg-white/[0.08] border border-white/[0.1] flex items-center justify-center mb-4">
                    <span className="font-display text-xl text-white/80">{item.step}</span>
                  </div>
                  <h3 className="font-display text-xl mb-3 text-white/90">{item.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{item.description}</p>
                </GlassTile>
                {i < 2 && (
                  <div className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 text-white/[0.15]">
                    <ArrowRight size={24} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Demo Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mb-4 text-white/90">
              See It In Action
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <GlassTile className="p-1 overflow-hidden">
              <div className="relative aspect-video bg-gradient-to-br from-white/[0.02] via-black to-black flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIE0gMCA2MCBMIDYwIDYwIiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
                <div className="relative text-center">
                  <div className="w-16 h-16 rounded-none bg-white/[0.08] border border-white/[0.1] flex items-center justify-center mx-auto mb-4">
                    <Zap size={32} className="text-white/60 animate-pulse" />
                  </div>
                  <p className="text-white/60 text-sm">Live workspace preview coming soon</p>
                </div>
              </div>
            </GlassTile>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-16 text-center"
          >
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight mb-4 text-white/90">
              Simple Pricing
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              Start free. Scale as you grow.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                name: "Free",
                price: "$0",
                description: "Perfect for trying it out",
                features: ["5 messages/day", "Basic agents", "Community support"],
                cta: "Get Started",
              },
              {
                name: "Pro",
                price: "$29",
                description: "For serious builders",
                features: ["Unlimited messages", "All agents", "Priority support", "Custom deployments"],
                cta: "Start Free Trial",
              },
              {
                name: "Business",
                price: "$99",
                description: "For growing teams",
                features: ["Everything in Pro", "Team collaboration", "Advanced analytics", "Dedicated support"],
                cta: "Contact Sales",
              },
              {
                name: "Enterprise",
                price: "$499",
                description: "For organizations",
                features: ["Everything in Business", "Custom agents", "On-premise option", "SLA & white-label"],
                cta: "Contact Sales",
              },
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
              >
                <GlassTile className="p-8 h-full flex flex-col">
                  <h3 className="font-display text-2xl mb-2 text-white/90">{plan.name}</h3>
                  <p className="text-sm text-white/60 mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="font-display text-4xl text-white/90">{plan.price}</span>
                    {plan.price !== "Custom" && <span className="text-white/60 text-sm">/month</span>}
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <CheckCircle2 size={16} className="text-white/40 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-white/70">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`w-full py-3 rounded-none font-medium text-sm transition-all duration-300 ${
                      i === 1
                        ? "bg-white text-black hover:bg-white/90"
                        : "bg-white/[0.05] border border-white/[0.1] text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    {plan.cta}
                  </button>
                </GlassTile>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <GlassTile className="p-12 text-center">
              <h2 className="font-display text-4xl sm:text-5xl tracking-tight mb-6 text-white/90">
                Ready to build with AI?
              </h2>
              <p className="text-lg text-white/60 mb-8 max-w-2xl mx-auto">
                Join builders, researchers, and entrepreneurs using Quoratorium to ship faster.
              </p>
              <Link
                href="/workspace"
                className="inline-flex px-8 py-4 rounded-none bg-white text-black font-medium text-sm hover:bg-white/90 transition-all duration-300 gap-2 group"
              >
                Start Building Now
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </GlassTile>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.06] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-display text-sm tracking-wider text-white/90 mb-4 uppercase">Product</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Docs
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-sm tracking-wider text-white/90 mb-4 uppercase">Company</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-sm tracking-wider text-white/90 mb-4 uppercase">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-white/60 hover:text-white/90 transition-colors">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-sm tracking-wider text-white/90 mb-4 uppercase">Social</h4>
              <div className="flex gap-4">
                <a href="#" className="text-white/60 hover:text-white/90 transition-colors">
                  <Github size={18} />
                </a>
                <a href="#" className="text-white/60 hover:text-white/90 transition-colors">
                  <Twitter size={18} />
                </a>
                <a href="#" className="text-white/60 hover:text-white/90 transition-colors">
                  <Mail size={18} />
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-8 flex flex-col sm:flex-row items-center justify-between text-sm text-white/60">
            <p>&copy; 2026 Quoratorium. All rights reserved.</p>
            <p>Built with Captain Q and the neural orchestration engine.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
