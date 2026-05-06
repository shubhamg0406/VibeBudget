import React from "react";
import {
  ArrowRight,
  Book,
  Cloud,
  FileText,
  Github,
  Globe,
  KeyRound,
  LineChart,
  Lock,
  Moon,
  ShieldCheck,
  Sparkles,
  SunMedium,
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

const featureCards = [
  {
    icon: WalletCards,
    title: "Track everything in one place",
    description:
      "Expenses, income, category targets, and trends — all in a single dashboard built for clarity.",
  },
  {
    icon: LineChart,
    title: "Understand your patterns",
    description:
      "Monthly trends, budget performance, and comparisons help you see where your money goes.",
  },
  {
    icon: Cloud,
    title: "Your data, your control",
    description:
      "Export anytime. Connect Google Drive or Sheets for backup and sync. No vendor lock-in.",
  },
];

const byokCards = [
  {
    icon: KeyRound,
    title: "Bring your own AI key",
    description:
      "Use Gemini or DeepSeek with your own API key for AI-powered transaction analysis.",
  },
  {
    icon: Globe,
    title: "Bring your own bank feed",
    description:
      "Connect Plaid or Teller with your own credentials for automated transaction imports.",
  },
];

const proofPoints = [
  "Open-source",
  "Google sign-in",
  "User-controlled data",
  "Self-hostable",
];

export const LoggedOutHome: React.FC<LoggedOutHomeProps> = ({
  theme,
  onToggleTheme,
  onOpenDocs,
}) => {
  const { signIn } = useFirebase();
  const isLight = theme === "light";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--app-shell)] text-[var(--app-text)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(105,246,184,0.24)_0%,_rgba(105,246,184,0)_72%)]" />
        <div className="absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(43,162,255,0.18)_0%,_rgba(43,162,255,0)_70%)]" />
        <div className="absolute bottom-[-9rem] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,214,102,0.12)_0%,_rgba(255,214,102,0)_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(255,255,255,0.02)_0%,_transparent_40%,_rgba(255,255,255,0.03)_100%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 pb-10 pt-5 sm:px-6 lg:px-8">
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

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <motion.section
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
              Your money. Your data. Your rules.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--app-text-soft)] sm:text-lg">
              VibeBudget is an open-source personal finance tracker that puts you
              in control. Track spending, set budgets, analyze trends — all
              without locking your data into a proprietary system.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => void signIn()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-5 py-3 text-sm font-semibold text-[#022616] shadow-[0_18px_36px_rgba(6,183,127,0.28)] transition-transform hover:-translate-y-0.5"
              >
                <span>Sign in with Google</span>
                <ArrowRight size={16} />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-3 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              >
                See what you can do
              </a>
            </div>

            <p className="mt-4 text-sm text-[var(--app-text-muted)]">
              Uses Google sign-in for the hosted app.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {proofPoints.map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-[var(--app-border)] bg-[var(--app-ghost)] px-3 py-2 text-xs text-[var(--app-text-soft)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="relative"
          >
            <div className="absolute inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_top,_rgba(105,246,184,0.16),_transparent_58%)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-[var(--app-border-strong)] bg-[color:var(--app-panel)]/88 p-5 shadow-[var(--app-shadow)] backdrop-blur-xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fintech-accent">
                    After signing in
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Full budget command center
                  </h2>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-semibold text-fintech-accent">
                    Free
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-[var(--app-border)] bg-[linear-gradient(180deg,_rgba(105,246,184,0.12)_0%,_rgba(105,246,184,0.03)_100%)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Monthly spend
                  </p>
                  <p className="mt-3 text-3xl font-semibold">$2,480</p>
                  <p className="mt-2 text-xs text-fintech-accent">
                    Down 8% vs prior range
                  </p>
                </div>
                <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    Saved this month
                  </p>
                  <p className="mt-3 text-3xl font-semibold">$1,140</p>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    After rent, transport, and groceries
                  </p>
                </div>
                <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                    At-risk categories
                  </p>
                  <p className="mt-3 text-3xl font-semibold">2</p>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    Dining and entertainment trending high
                  </p>
                </div>
              </div>

              <div id="how-it-works" className="mt-6 space-y-3">
                {featureCards.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.3,
                        delay: 0.16 + index * 0.08,
                      }}
                      className="flex gap-4 rounded-3xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-panel-strong)] text-fintech-accent">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-text-muted)]">
                          {item.description}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Data control + BYOK row inside the card */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-ghost)] p-4">
                  <div className="flex items-center gap-2">
                    <Lock size={14} className="text-fintech-accent" />
                    <p className="text-xs font-semibold">
                      User-controlled data
                    </p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
                    Export or wipe your data anytime. Connect Google Drive for
                    backup or Google Sheets for external editing. No lock-in.
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-ghost)] p-4">
                  <div className="flex items-center gap-2">
                    <KeyRound size={14} className="text-fintech-accent" />
                    <p className="text-xs font-semibold">BYOK for providers</p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
                    Use your own API keys for AI (Gemini, DeepSeek) and bank
                    feeds (Plaid, Teller). No subscription needed.
                  </p>
                </div>
              </div>

            </div>
          </motion.section>
        </div>



        {/* Hosted / Self-host / Docs option cards */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mt-8 grid gap-4 pb-10 sm:grid-cols-3"
        >
          <div className="rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-5 backdrop-blur-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-panel-strong)] text-fintech-accent">
              <Cloud size={18} />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Hosted app</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
              Use the hosted version at vibebudget.app. No setup, no
              infrastructure. Google sign-in included.
            </p>
            <button
              onClick={() => void signIn()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-fintech-accent px-4 py-2 text-xs font-semibold text-[#022616] transition-transform hover:-translate-y-0.5"
            >
              <span>Sign in to hosted app</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-5 backdrop-blur-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-panel-strong)] text-fintech-accent">
              <Github size={18} />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Self-host on GitHub</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
              Deploy on your own infrastructure. Full control over your data,
              Firebase, and providers.
            </p>
            <a
              href="https://github.com/th0mk4k4/vibebudget"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              <Github size={13} />
              <span>View on GitHub</span>
            </a>
          </div>

          <div className="rounded-2xl border border-[var(--app-border)] bg-[color:var(--app-panel)]/70 p-5 backdrop-blur-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-panel-strong)] text-fintech-accent">
              <Book size={18} />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Docs &amp; guides</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">
              Self-hosting guide, BYOK provider setup, troubleshooting, and
              roadmap.
            </p>
            <button
              onClick={onOpenDocs}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              <Book size={13} />
              <span>Read docs</span>
            </button>
          </div>
        </motion.section>
      </div>
    </div>
  );
};
