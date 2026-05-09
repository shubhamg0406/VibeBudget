import React from "react";
import {
  ArrowRight,
  Book,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  Github,
  Globe,
  KeyRound,
  LineChart,
  Lock,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Target,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";
import { motion } from "motion/react";
import { Theme } from "../types";
import { useFirebase } from "../contexts/FirebaseContext";

interface LoggedOutHomeProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenDocs?: () => void;
}

const outcomes = [
  {
    icon: Wallet,
    title: "Track income & expenses",
    description:
      "Log transactions in seconds. See everything — spending and earnings — in one unified timeline.",
  },
  {
    icon: Target,
    title: "Set budgets & targets",
    description:
      "Define monthly category targets and monitor your pace in real time. Know when you're on track before it's too late.",
  },
  {
    icon: TrendingUp,
    title: "Analyze spending trends",
    description:
      "Compare periods, spot category drift, and understand where your money goes with clear charts and comparisons.",
  },
  {
    icon: Lock,
    title: "Own your financial data",
    description:
      "Export or wipe your data anytime. Connect Google Drive for backup or Sheets for external editing. No lock-in.",
  },
];

const steps = [
  {
    number: "1",
    title: "Sign in with Google",
    description: "No setup, no infrastructure. Your data stays tied to your account.",
  },
  {
    number: "2",
    title: "Add your transactions",
    description: "Log expenses and income manually, import CSVs, or connect bank feeds.",
  },
  {
    number: "3",
    title: "Track, budget & analyze",
    description: "Use the dashboard, stats, and targets to stay on top of your money.",
  },
];

const trustSignals = [
  {
    icon: Github,
    title: "Open source & auditable",
    description: "Every line of code is visible. No black boxes, no hidden telemetry.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-first design",
    description: "No tracking scripts, no third-party data sale. Your data is yours.",
  },
  {
    icon: KeyRound,
    title: "Bring your own keys",
    description: "AI, bank feeds, Google APIs — use your own accounts and credentials.",
  },
  {
    icon: Database,
    title: "Data portability",
    description: "Import, export, backup, and migrate your data freely. No proprietary formats.",
  },
];

const providers = [
  "Google Drive & Sheets",
  "Gemini / DeepSeek AI",
  "Plaid bank feeds",
  "Teller bank feeds",
];

export const LoggedOutHome: React.FC<LoggedOutHomeProps> = ({
  theme,
  onToggleTheme,
  onOpenDocs,
}) => {
  const { signIn } = useFirebase();
  const isLight = theme === "light";

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--app-shell)] text-[var(--app-text)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(105,246,184,0.24)_0%,_rgba(105,246,184,0)_72%)]" />
        <div className="absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(43,162,255,0.18)_0%,_rgba(43,162,255,0)_70%)]" />
        <div className="absolute bottom-[-9rem] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,214,102,0.12)_0%,_rgba(255,214,102,0)_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(255,255,255,0.02)_0%,_transparent_40%,_rgba(255,255,255,0.03)_100%)]" />
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-7xl px-5 pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-full border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 px-4 py-3 shadow-[var(--app-shadow)] backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_rgba(105,246,184,0.24)_0%,_rgba(6,183,127,0.6)_100%)] text-[#dffef2] shadow-[0_12px_32px_rgba(6,183,127,0.24)]">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">VibeBudget</p>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-muted)]">
                Open-source finance hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--app-text-muted)] transition-colors hover:border-fintech-accent/40 hover:text-fintech-accent"
              aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
            >
              {isLight ? <Moon size={15} /> : <SunMedium size={15} />}
              <span>{isLight ? "Dark" : "Light"}</span>
            </button>
            {onOpenDocs && (
              <button
                onClick={onOpenDocs}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--app-text-muted)] transition-colors hover:border-fintech-accent/40 hover:text-fintech-accent"
              >
                <FileText size={14} />
                <span>Docs</span>
              </button>
            )}
            <button
              onClick={() => void signIn()}
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-4 py-2 text-[12px] font-semibold text-[#032a1a] shadow-[0_14px_30px_rgba(6,183,127,0.3)] transition-transform hover:-translate-y-0.5"
            >
              <span>Sign in with Google</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fintech-accent">
              <ShieldCheck size={13} />
              Open-source personal finance hub
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--app-text)] sm:text-5xl lg:text-6xl">
              Your budget. Your data. Your terms.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--app-text-soft)] sm:text-lg">
              VibeBudget is a privacy-first, open-source budgeting workspace. Track
              income and expenses, set targets, and understand your spending
              patterns — without locking your data into a proprietary system.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => void signIn()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-6 py-3 text-sm font-semibold text-[#022616] shadow-[0_18px_36px_rgba(6,183,127,0.28)] transition-transform hover:-translate-y-0.5"
              >
                <span>Start budgeting free</span>
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => scrollTo("how-it-works")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-3 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              >
                <span>See how it works</span>
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {[
                "Open source",
                "Privacy-first",
                "Self-hostable",
                "No lock-in",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-[var(--app-border)] bg-[var(--app-ghost)] px-3 py-2 text-xs text-[var(--app-text-soft)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="relative"
          >
            <div className="absolute inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_top,_rgba(105,246,184,0.16),_transparent_58%)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--app-border-strong)] bg-[color:var(--app-panel)]/88 p-6 shadow-[var(--app-shadow)] backdrop-blur-xl sm:p-8">
              <div className="flex items-center justify-between">
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Status
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-fintech-accent">
                    <CheckCircle2 size={14} />
                    Free & open source
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,_rgba(105,246,184,0.2)_0%,_rgba(6,183,127,0.5)_100%)] text-fintech-accent">
                  <WalletCards size={20} />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Monthly spending
                  </p>
                  <p className="mt-2 text-2xl font-semibold">$2,480</p>
                  <p className="mt-1 text-xs text-fintech-accent">
                    vs $2,700 last month
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Budget targets
                  </p>
                  <p className="mt-2 text-2xl font-semibold">3 of 5</p>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    categories on track
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Saved this month
                  </p>
                  <p className="mt-2 text-2xl font-semibold">$1,140</p>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    after fixed expenses
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[linear-gradient(180deg,_rgba(105,246,184,0.1)_0%,_rgba(105,246,184,0.02)_100%)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Data ownership
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Lock size={14} className="text-fintech-accent" />
                    <p className="text-sm font-semibold text-fintech-accent">
                      User-controlled
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    Export, backup, or self-host
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-ghost)] px-4 py-3">
                <ShieldCheck size={14} className="shrink-0 text-fintech-accent" />
                <p className="text-xs text-[var(--app-text-muted)]">
                  No vendor lock-in. No tracking. No hidden costs.
                </p>
              </div>
            </div>
          </motion.div>
        </section>

        <section id="core-outcomes" className="scroll-mt-20 pb-8 pt-12">
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fintech-accent">
              Core outcomes
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              What you get with VibeBudget
            </h2>
            <p className="mt-3 text-base text-[var(--app-text-soft)]">
              A practical set of tools for understanding and controlling your
              monthly cash flow.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {outcomes.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  className="rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-5 backdrop-blur-xl"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-panel-strong)] text-fintech-accent">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">
                    {item.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-20 border-t border-[var(--app-border)] pb-8 pt-14"
        >
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fintech-accent">
              How it works
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Start budgeting in minutes
            </h2>
            <p className="mt-3 text-base text-[var(--app-text-soft)]">
              No credit card. No infrastructure. Just you and your budget.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
                className="relative text-center"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--app-border)] bg-[linear-gradient(135deg,_rgba(105,246,184,0.15)_0%,_rgba(6,183,127,0.3)_100%)] text-lg font-bold text-fintech-accent">
                  {step.number}
                </div>
                {index < steps.length - 1 && (
                  <div className="absolute left-[calc(50%+2.5rem)] top-7 hidden h-px w-[calc(100%-5rem)] border-t border-dashed border-[var(--app-border)] sm:block" />
                )}
                <h3 className="mt-5 text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        <section
          id="setup-paths"
          className="scroll-mt-20 border-t border-[var(--app-border)] pb-8 pt-14"
        >
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fintech-accent">
              Two ways to use it
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Hosted or self-hosted
            </h2>
            <p className="mt-3 text-base text-[var(--app-text-soft)]">
              Choose the path that fits your comfort level. Same product, same
              features.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35 }}
              className="relative rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-6 backdrop-blur-xl"
            >
              <div className="absolute right-4 top-4 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fintech-accent">
                Quick start
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,_rgba(105,246,184,0.2)_0%,_rgba(6,183,127,0.5)_100%)] text-fintech-accent">
                <Cloud size={18} />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                Hosted convenience
              </h3>
              <p className="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">
                Use the official hosted version. Google sign-in, managed
                infrastructure, and zero setup — ready in under a minute.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "No infrastructure to manage",
                  "Automatic updates & backups",
                  "Google sign-in included",
                  "Same features as self-hosted",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-xs text-[var(--app-text-soft)]"
                  >
                    <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-fintech-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void signIn()}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-4 py-2.5 text-xs font-semibold text-[#022616] shadow-[0_12px_24px_rgba(6,183,127,0.22)] transition-transform hover:-translate-y-0.5"
              >
                <span>Use hosted VibeBudget</span>
                <ArrowRight size={14} />
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className="rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-6 backdrop-blur-xl"
            >
              <div className="absolute right-4 top-4 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                Full control
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-panel-strong)] text-fintech-accent">
                <Github size={18} />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                Self-hosted control
              </h3>
              <p className="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">
                Deploy on your own infrastructure with your own Firebase project.
                Full control over data, credentials, and updates.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Your own Firebase & Vercel",
                  "Complete data sovereignty",
                  "Bring your own provider keys",
                  "Open source — audit or modify",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-xs text-[var(--app-text-soft)]"
                  >
                    <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-fintech-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="https://github.com/th0mk4k4/vibebudget"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-2.5 text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              >
                <Github size={14} />
                <span>View on GitHub</span>
              </a>
            </motion.div>
          </div>
        </section>

        <section
          id="trust-privacy"
          className="scroll-mt-20 border-t border-[var(--app-border)] pb-8 pt-14"
        >
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fintech-accent">
              Trust & privacy
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Built on transparency
            </h2>
            <p className="mt-3 text-base text-[var(--app-text-soft)]">
              Financial tools should earn your trust, not assume it.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {trustSignals.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  className="flex gap-4 rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-5 backdrop-blur-xl"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-panel-strong)] text-fintech-accent">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section
          id="integrations"
          className="scroll-mt-20 border-t border-[var(--app-border)] pb-8 pt-14"
        >
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(105,246,184,0.22)] bg-[rgba(105,246,184,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fintech-accent">
              Integrations
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Connect your tools
            </h2>
            <p className="mt-3 text-base text-[var(--app-text-soft)]">
              Bring your own accounts and credentials. No mandatory subscriptions.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {providers.map((provider) => (
              <div
                key={provider}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 px-4 py-2.5 text-xs font-medium text-[var(--app-text-soft)] backdrop-blur-xl"
              >
                <RefreshCw size={12} className="text-fintech-accent" />
                {provider}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button
              onClick={onOpenDocs}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--app-text-muted)] underline underline-offset-2 transition-colors hover:text-fintech-accent"
            >
              <Book size={12} />
              View provider setup guides
            </button>
          </div>
        </section>

        <section className="border-t border-[var(--app-border)] py-16 text-center">
          <div className="mx-auto max-w-lg">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to take control of your budget?
            </h2>
            <p className="mt-3 text-base text-[var(--app-text-soft)]">
              Free to start. No credit card. Your data stays yours.
            </p>
            <button
              onClick={() => void signIn()}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-8 py-3.5 text-sm font-semibold text-[#022616] shadow-[0_18px_36px_rgba(6,183,127,0.28)] transition-transform hover:-translate-y-0.5"
            >
              <span>Sign in with Google — it's free</span>
              <ArrowRight size={16} />
            </button>
            <p className="mt-4 text-xs text-[var(--app-text-muted)]">
              Uses Google sign-in. No setup required for the hosted version.
            </p>
          </div>
        </section>

        <footer className="border-t border-[var(--app-border)] py-6 text-center text-xs text-[var(--app-text-muted)]">
          <p>VibeBudget — open-source personal finance hub</p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <a
              href="https://github.com/th0mk4k4/vibebudget"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-fintech-accent"
            >
              <Github size={12} />
              GitHub
            </a>
            {onOpenDocs && (
              <button
                onClick={onOpenDocs}
                className="inline-flex items-center gap-1 transition-colors hover:text-fintech-accent"
              >
                <Book size={12} />
                Docs
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
