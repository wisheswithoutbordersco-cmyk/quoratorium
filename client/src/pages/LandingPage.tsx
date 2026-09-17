import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Flower2,
  Gem,
  HeartHandshake,
  Layers3,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  SunMedium,
} from "lucide-react";
import { HyperBlackQSmall } from "@/components/HyperBlackQ";

const TORIU_HERO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663555998255/TWeyhcgdWxqFDZxk.png";

const orchestrationAgents = [
  {
    icon: Code2,
    name: "Builder",
    model: "Creates the solution",
    copy: "Turns your intent into production-ready code, files, and working interfaces.",
  },
  {
    icon: Search,
    name: "Researcher",
    model: "Finds the right context",
    copy: "Investigates requirements, patterns, and sources before decisions are made.",
  },
  {
    icon: CheckCircle2,
    name: "Validator",
    model: "Protects the outcome",
    copy: "Reviews quality, security, and completeness before work reaches you.",
  },
  {
    icon: Rocket,
    name: "Deployer",
    model: "Ships with confidence",
    copy: "Packages and moves approved work from the workspace into the world.",
  },
];

const values = [
  {
    icon: SunMedium,
    eyebrow: "Orange",
    title: "Energy with purpose",
    copy: "Warm, capable momentum that turns an idea into meaningful action.",
  },
  {
    icon: Gem,
    eyebrow: "Pearl",
    title: "Clarity and wellbeing",
    copy: "Calm guidance, considered choices, and a workspace that never feels chaotic.",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Bull",
    title: "Stability you can trust",
    copy: "Dependable execution, careful validation, and strong safeguards at every step.",
  },
  {
    icon: Flower2,
    eyebrow: "Carnation",
    title: "Care in every interaction",
    copy: "A helpful presence that listens, remembers context, and stays by your side.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    copy: "A simple way to meet Toríu and explore the workspace.",
    features: ["5 messages per day", "Core orchestration", "Community support"],
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$29",
    copy: "For independent builders who want to move faster.",
    features: ["Unlimited conversations", "All specialist agents", "Project memory", "Custom deployments"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Business",
    price: "$99",
    copy: "For growing teams coordinating real work.",
    features: ["Everything in Pro", "Team collaboration", "Advanced analytics", "Priority support"],
    cta: "Contact sales",
  },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark-shell">
        <HyperBlackQSmall className="h-7 w-7" />
      </div>
      {!compact && (
        <span className="font-display text-sm font-bold tracking-[0.18em] text-[#fff8f2] sm:text-base">
          QUORATORIUM
        </span>
      )}
    </div>
  );
}

function EmberCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ember-card ${className}`}>{children}</div>;
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#050302] text-[#fff8f2]">
      <div className="fixed inset-0 pointer-events-none opacity-80" aria-hidden="true">
        <div className="absolute left-[-20%] top-[-18rem] h-[42rem] w-[42rem] rounded-full bg-[#8f3408]/15 blur-[150px]" />
        <div className="absolute right-[-18rem] top-[28rem] h-[42rem] w-[42rem] rounded-full bg-[#d86618]/10 blur-[170px]" />
        <div className="ember-grid absolute inset-0" />
      </div>

      <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#f28c38]/10 bg-[#050302]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Quoratorium home">
            <BrandMark />
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#orchestration" className="nav-link">Orchestration</a>
            <a href="#values" className="nav-link">Values</a>
            <a href="#pricing" className="nav-link">Pricing</a>
          </div>
          <Link href="/workspace" className="ember-button ember-button-small">
            Enter workspace
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </nav>

      <main className="relative">
        <section className="relative min-h-[760px] border-b border-[#f28c38]/10 pt-[72px] lg:min-h-[820px]">
          <div className="mx-auto grid max-w-7xl items-center px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.23, 1, 0.32, 1] }}
              className="relative z-10 max-w-2xl"
            >
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#e77a25]/25 bg-[#e77a25]/8 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffb065]">
                <Sparkles size={13} />
                Trusted multi-model orchestration
              </div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.26em] text-[#d77a2c]">Meet Toríu</p>
              <h1 className="font-display max-w-[820px] text-5xl font-bold leading-[0.94] tracking-[-0.055em] text-[#fff9f4] sm:text-6xl lg:text-[5.6rem]">
                Your ideas,
                <span className="block ember-text">orchestrated.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-[#cdbeb3] sm:text-lg">
                Toríu is your trustworthy orchestration agent inside Quoratorium—coordinating specialized AI models to research, build, validate, and ship the work that matters.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/workspace" className="ember-button">
                  Start building with Toríu
                  <ArrowRight size={17} />
                </Link>
                <a href="#how" className="ember-button-secondary">
                  <Play size={15} fill="currentColor" />
                  See how it works
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#9f8f84]">
                {["One conversation", "Multiple specialists", "You stay in control"].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <Check size={13} className="text-[#ee852c]" /> {item}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
              className="relative -mx-5 mt-12 min-h-[510px] overflow-hidden sm:mx-0 lg:mt-0 lg:min-h-[680px]"
            >
              <div className="absolute inset-0 rounded-[2rem] border border-[#ff983e]/15 bg-[#0b0502] shadow-[0_35px_120px_rgba(139,49,4,0.28)] lg:rounded-[2.6rem]" />
              <img
                src={TORIU_HERO}
                alt="Toríu, Quoratorium's friendly orchestration agent"
                className="absolute inset-0 h-full w-full object-cover object-[58%_center]"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050302] via-transparent to-transparent opacity-35" />
              <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-[#ff9a44]/20 bg-[#090503]/78 p-4 backdrop-blur-xl sm:bottom-7 sm:left-7 sm:right-auto sm:w-[320px]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff9b45]/35 bg-[#d86116]/15 text-sm font-bold text-[#ff9b45]">T</div>
                  <div>
                    <p className="text-sm font-semibold text-[#fff8f2]">Toríu is ready</p>
                    <p className="mt-0.5 text-[11px] text-[#aa9689]">Listening, planning, orchestrating</p>
                  </div>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-b border-[#f28c38]/10 bg-[#080402]">
          <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-[#f28c38]/10 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              [ShieldCheck, "Protection", "Your work and data are handled with care."],
              [Layers3, "Identity", "Your intent stays central from start to finish."],
              [HeartHandshake, "Friendliness", "Clear guidance without needless complexity."],
            ].map(([Icon, title, copy]) => {
              const ValueIcon = Icon as typeof ShieldCheck;
              return (
                <div key={String(title)} className="flex items-start gap-4 py-7 md:px-7 first:pl-0 last:pr-0">
                  <ValueIcon size={20} className="mt-0.5 shrink-0 text-[#e77a25]" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f5a35d]">{String(title)}</p>
                    <p className="mt-1 text-sm leading-6 text-[#9f8f84]">{String(copy)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="orchestration" className="relative py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <p className="section-kicker">One guide. Many specialists.</p>
                <h2 className="section-title">Toríu keeps the whole team moving as one.</h2>
                <p className="section-copy">
                  You speak with one trusted agent. Behind the scenes, Toríu chooses the right specialist, preserves context, and checks the work before it comes back to you.
                </p>
                <div className="mt-8 rounded-2xl border border-[#f28c38]/15 bg-[#d86116]/[0.06] p-5">
                  <div className="flex items-center gap-3">
                    <Bot size={19} className="text-[#ff9b45]" />
                    <span className="text-sm font-semibold text-[#fff4ea]">Toríu coordinates the handoffs</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#a9978a]">Less tool switching. Less lost context. More finished work.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {orchestrationAgents.map((agent, index) => (
                  <motion.div
                    key={agent.name}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ delay: index * 0.07, duration: 0.45 }}
                  >
                    <EmberCard className="h-full p-6 sm:p-7">
                      <div className="mb-10 flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#ef852d]/20 bg-[#ef852d]/10 text-[#f49543]">
                          <agent.icon size={19} />
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#7f6d61]">Agent 0{index + 1}</span>
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d97524]">{agent.model}</p>
                      <h3 className="mt-2 font-display text-2xl font-semibold text-[#fff8f2]">{agent.name}</h3>
                      <p className="mt-3 text-sm leading-7 text-[#a9978a]">{agent.copy}</p>
                    </EmberCard>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-[#f28c38]/10 bg-[#080402] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="section-kicker">A calmer way to build</p>
              <h2 className="section-title">From first thought to finished work.</h2>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-[#f28c38]/12 bg-[#f28c38]/12 lg:grid-cols-3">
              {[
                ["01", "Tell Toríu", "Describe the outcome in your own words. Add files, examples, or constraints whenever you need."],
                ["02", "Watch the work", "Toríu forms a plan, coordinates the right agents, and keeps every step visible in one conversation."],
                ["03", "Review and ship", "Inspect the result, ask for refinements, and deploy only when the work feels right."],
              ].map(([step, title, copy]) => (
                <div key={step} className="bg-[#090503] p-7 sm:p-9">
                  <span className="font-mono text-xs text-[#d76a1b]">{step}</span>
                  <h3 className="mt-10 font-display text-2xl font-semibold text-[#fff8f2]">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#9f8f84]">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="values" className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
              <div>
                <p className="section-kicker">The meaning behind Toríu</p>
                <h2 className="section-title">Guided by values. Driven by purpose.</h2>
                <p className="section-copy">Toríu is designed to feel capable without feeling cold—an agent with the steadiness to protect your work and the warmth to help you move forward.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {values.map((value) => (
                  <EmberCard key={value.eyebrow} className="p-6">
                    <value.icon size={20} className="text-[#ef852d]" />
                    <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d66b1d]">{value.eyebrow}</p>
                    <h3 className="mt-2 text-lg font-semibold text-[#fff8f2]">{value.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#9f8f84]">{value.copy}</p>
                  </EmberCard>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-[#f28c38]/10 bg-[#080402] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">Simple pricing</p>
              <h2 className="section-title">Start with one conversation.</h2>
              <p className="section-copy mx-auto">Choose the pace that fits your work. Every plan keeps Toríu at the center.</p>
            </div>
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <EmberCard key={plan.name} className={`flex h-full flex-col p-7 sm:p-8 ${plan.featured ? "ember-card-featured" : ""}`}>
                  {plan.featured && <span className="mb-5 w-fit rounded-full bg-[#d76617] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">Most popular</span>}
                  <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-[#9f8f84]">{plan.copy}</p>
                  <div className="mt-7 flex items-end gap-1">
                    <span className="font-display text-5xl font-bold tracking-[-0.05em]">{plan.price}</span>
                    <span className="pb-1 text-sm text-[#7f6d61]">/ month</span>
                  </div>
                  <ul className="mt-8 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm text-[#c8b7aa]">
                        <Check size={14} className="text-[#ed852d]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href="/workspace" className={plan.featured ? "ember-button mt-9" : "ember-button-secondary mt-9"}>
                    {plan.cta}
                    <ArrowRight size={15} />
                  </Link>
                </EmberCard>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="absolute inset-x-0 bottom-0 mx-auto h-[28rem] max-w-5xl rounded-full bg-[#bb480d]/12 blur-[140px]" />
          <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
            <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f28c38]/25 bg-[#d86116]/10 text-2xl font-bold text-[#ff9a44] shadow-[0_0_45px_rgba(216,97,22,.16)]">T</div>
            <h2 className="font-display text-4xl font-bold tracking-[-0.04em] sm:text-6xl">Ready to build with Toríu?</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#aa998c]">Bring the idea. Toríu will assemble the team, keep the context, and help you carry it across the finish line.</p>
            <Link href="/workspace" className="ember-button mt-9">
              Enter Quoratorium
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-[#f28c38]/10 bg-[#040201]">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <BrandMark />
          <p className="text-sm text-[#7f6d61]">Toríu is here to orchestrate possibilities—and empower your journey.</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5e4e44]">© 2026 Quoratorium</p>
        </div>
      </footer>
    </div>
  );
}
