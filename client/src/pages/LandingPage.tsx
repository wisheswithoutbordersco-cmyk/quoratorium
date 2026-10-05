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
  Search,
  ShieldCheck,
  Sparkles,
  SunMedium,
} from "lucide-react";
import { HyperBlackQSmall } from "@/components/HyperBlackQ";

const TORIU_HERO =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663555998255/TWeyhcgdWxqFDZxk.png";

const orchestrationAgents = [
  {
    icon: Code2,
    name: "Builder",
    model: "Creates the materials",
    copy: "Turns your lesson idea into finished, printable classroom resources.",
  },
  {
    icon: Search,
    name: "Researcher",
    model: "Finds the right content",
    copy: "Verifies facts, standards, and sources before anything reaches your classroom.",
  },
  {
    icon: CheckCircle2,
    name: "Validator",
    model: "Protects the outcome",
    copy: "Checks grade level, accuracy, and answer-key alignment before you print.",
  },
];

const values = [
  {
    icon: SunMedium,
    eyebrow: "Time back",
    title: "More evenings for you",
    copy: "Turn tomorrow's worksheet, center, or handout into classroom-ready materials without losing your evening.",
  },
  {
    icon: Gem,
    eyebrow: "Your classroom",
    title: "Your style leads",
    copy: "Toríú follows your routines, grade level, and teaching style—not a one-size-fits-all template.",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Classroom-ready",
    title: "Ready before you print",
    copy: "Checks help catch mismatched grade levels, facts, and answer keys before materials reach your students.",
  },
  {
    icon: Flower2,
    eyebrow: "Teacher-first",
    title: "Care in every interaction",
    copy: "Clear, encouraging support for the real work and time pressure of teaching.",
  },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark-shell">
        <HyperBlackQSmall className="h-7 w-7" />
      </div>
      {!compact && (
        <span className="font-display text-sm font-bold tracking-[0.18em] text-[#fff8f2] max-[360px]:hidden sm:text-base">
          QUORATORIUM
        </span>
      )}
    </div>
  );
}

function EmberCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`ember-card ${className}`}>{children}</div>;
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#050302] text-[#fff8f2]">
      <div
        className="fixed inset-0 pointer-events-none opacity-80"
        aria-hidden="true"
      >
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
            <a href="#orchestration" className="nav-link">
              How it works
            </a>
            <a href="#values" className="nav-link">
              For teachers
            </a>
            <a href="#early-access" className="nav-link">
              Early access
            </a>
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
                MEET TORIÚ
              </div>
              <h1 className="font-display max-w-[820px] text-4xl font-bold leading-[1.02] tracking-[-0.055em] text-[#fff9f4] sm:text-6xl lg:text-[4.5rem]">
                Tell her what you need for your classroom.
                <span className="block ember-text">She handles the rest.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#cdbeb3] sm:text-lg sm:leading-8">
                Toríú is your AI teaching assistant. Send her a photo of a
                worksheet and she rebuilds it, fully editable. Ask for a
                fractions center for tomorrow and it comes back classroom-ready,
                differentiated, with an answer key. You never see the machinery.
                You just get the work.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href="https://tally.so/r/jaOyB1" className="ember-button">
                  Get early access
                  <ArrowRight size={17} />
                </a>
                <a href="#watch" className="ember-button-secondary">
                  <Play size={15} fill="currentColor" />
                  See how it works
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#9f8f84]">
                {[
                  "One conversation, not five AI apps",
                  "You stay in control",
                  "Built for real classroom deadlines",
                ].map(item => (
                  <span key={item} className="flex items-center gap-2">
                    <Check size={13} className="text-[#ee852c]" /> {item}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: 0.12,
                duration: 0.8,
                ease: [0.23, 1, 0.32, 1],
              }}
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff9b45]/35 bg-[#d86116]/15 text-sm font-bold text-[#ff9b45]">
                    T
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#fff8f2]">
                      Toríu is ready
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#aa9689]">
                      Listening, planning, orchestrating
                    </p>
                  </div>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              </div>
            </motion.div>
          </div>
        </section>

        <section
          id="watch"
          className="scroll-mt-24 border-b border-[#f28c38]/10 bg-[#080402] py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-kicker">
                A peek inside the classroom workflow
              </p>
              <h2 className="section-title">Watch Toríú work</h2>
            </div>
            <div
              role="img"
              aria-label="Demo video drops this week — follow @quoratorium."
              className="relative mx-auto mt-10 flex aspect-video max-h-[620px] w-full max-w-5xl items-center justify-center overflow-hidden rounded-3xl border border-[#f28c38]/20 bg-[#0b0502] px-5 shadow-[0_35px_120px_rgba(139,49,4,0.2)] sm:mt-14 sm:rounded-[2rem]"
            >
              <div
                className="ember-grid absolute inset-0 opacity-50"
                aria-hidden="true"
              />
              <div
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(216,97,22,0.13),transparent_65%)]"
                aria-hidden="true"
              />
              <p className="relative max-w-md text-center text-base font-medium leading-7 text-[#f5d9c3] sm:text-xl sm:leading-8">
                Demo video drops this week — follow @quoratorium.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-[#f28c38]/10 bg-[#080402]">
          <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-[#f28c38]/10 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              [
                ShieldCheck,
                "Protection",
                "Your materials and data stay yours.",
              ],
              [
                Layers3,
                "Identity",
                "Your classroom needs lead — Toríú adapts to your style, not the other way around.",
              ],
              [
                HeartHandshake,
                "Friendliness",
                "Clear answers without edu-jargon or tool-learning.",
              ],
            ].map(([Icon, title, copy]) => {
              const ValueIcon = Icon as typeof ShieldCheck;
              return (
                <div
                  key={String(title)}
                  className="flex items-start gap-4 py-7 md:px-7 first:pl-0 last:pr-0"
                >
                  <ValueIcon
                    size={20}
                    className="mt-0.5 shrink-0 text-[#e77a25]"
                  />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f5a35d]">
                      {String(title)}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#9f8f84]">
                      {String(copy)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="orchestration" className="relative py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12">
              <div className="max-w-3xl">
                <p className="section-kicker">One guide. Many specialists.</p>
                <h2 className="section-title">
                  Toríu keeps the whole team moving as one.
                </h2>
                <p className="section-copy">
                  You speak with one trusted agent. Behind the scenes, Toríu
                  chooses the right specialist, preserves context, and checks
                  the work before it comes back to you.
                </p>
                <div className="mt-8 flex max-w-xl items-start gap-3 rounded-2xl border border-[#f28c38]/15 bg-[#d86116]/[0.06] p-5">
                  <Bot size={19} className="mt-0.5 shrink-0 text-[#ff9b45]" />
                  <p className="text-sm leading-6 text-[#a9978a]">
                    Toríú coordinates the handoffs — less searching, less prep
                    time, more finished lessons.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#7f6d61]">
                          Agent 0{index + 1}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d97524]">
                        {agent.model}
                      </p>
                      <h3 className="mt-2 font-display text-2xl font-semibold text-[#fff8f2]">
                        {agent.name}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-[#a9978a]">
                        {agent.copy}
                      </p>
                    </EmberCard>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="how"
          className="border-y border-[#f28c38]/10 bg-[#080402] py-24 sm:py-32"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="section-kicker">A calmer way to teach</p>
              <h2 className="section-title">
                From first thought to finished work.
              </h2>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-[#f28c38]/12 bg-[#f28c38]/12 lg:grid-cols-3">
              {[
                [
                  "01",
                  "Tell Toríú",
                  "Describe what you need in your own words — a worksheet rebuilt, a center activity, a quiz, a handout. Attach an example anytime.",
                ],
                [
                  "02",
                  "Watch the work",
                  "Toríú plans it, calls the right specialists, and keeps every step visible in one conversation.",
                ],
                [
                  "03",
                  "Review and ship",
                  "Check the result, ask for changes, and download classroom-ready files when it feels right.",
                ],
              ].map(([step, title, copy]) => (
                <div key={step} className="bg-[#090503] p-7 sm:p-9">
                  <span className="font-mono text-xs text-[#d76a1b]">
                    {step}
                  </span>
                  <h3 className="mt-10 font-display text-2xl font-semibold text-[#fff8f2]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#9f8f84]">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="values" className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
              <div>
                <p className="section-kicker">Made for the work teachers do</p>
                <h2 className="section-title">
                  More support for every school day.
                </h2>
                <p className="section-copy">
                  From the first idea to the final answer key, Toríú helps you
                  make useful classroom materials in your own teaching style.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {values.map(value => (
                  <EmberCard key={value.eyebrow} className="p-6">
                    <value.icon size={20} className="text-[#ef852d]" />
                    <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d66b1d]">
                      {value.eyebrow}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#fff8f2]">
                      {value.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#9f8f84]">
                      {value.copy}
                    </p>
                  </EmberCard>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="early-access"
          className="scroll-mt-24 border-y border-[#f28c38]/10 bg-[#080402] py-20 sm:py-28"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">EARLY ACCESS</p>
              <h2 className="section-title">
                Toríú is opening to teachers soon.
              </h2>
              <p className="section-copy mx-auto">
                Join the waitlist and tell us the first thing you'd ask her.
              </p>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="absolute inset-x-0 bottom-0 mx-auto h-[28rem] max-w-5xl rounded-full bg-[#bb480d]/12 blur-[140px]" />
          <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
            <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f28c38]/25 bg-[#d86116]/10 text-2xl font-bold text-[#ff9a44] shadow-[0_0_45px_rgba(216,97,22,.16)]">
              T
            </div>
            <h2 className="font-display text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
              Ready to meet Toríú?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#aa998c]">
              Bring the lesson idea. She'll bring the team.
            </p>
            <a href="https://tally.so/r/jaOyB1" className="ember-button mt-9">
              Get early access
              <ArrowRight size={17} />
            </a>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-[#f28c38]/10 bg-[#040201]">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <BrandMark />
          <p className="text-sm text-[#7f6d61]">
            Toríú is here to give teachers their evenings back.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5e4e44]">
            © 2026 Quoratorium
          </p>
        </div>
      </footer>
    </div>
  );
}
