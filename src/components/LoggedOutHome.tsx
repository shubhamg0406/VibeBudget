import React from "react";
import {
  ArrowRight,
  Cloud,
  LineChart,
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
}

const featureCards = [
  {
    icon: WalletCards,
    title: "All your spending in one calm place",
    description: "Track expenses, income, and category targets without bouncing between tabs and spreadsheets.",
  },
  {
    icon: LineChart,
    title: "See progress instead of raw numbers",
    description: "Monthly trends, budget performance, and useful snapshots help you act faster.",
  },
  {
    icon: Cloud,
    title: "Stay synced with Google tools",
    description: "Use Google sign-in, connect Sheets, and keep your budget close to your existing workflow.",
  },
];

const proofPoints = [
  "Google sign-in with your existing account",
  "Budget categories, transaction history, and analysis in one flow",
  "Built for private personal finance tracking",
];

export const LoggedOutHome: React.FC<LoggedOutHomeProps> = ({ theme, onToggleTheme }) => {
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
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-muted)]">Private finance hub</p>
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
              Personal budgeting without the blank-state confusion
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--app-text)] sm:text-5xl lg:text-6xl">
              Budgeting that feels clear the moment you sign in.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--app-text-soft)] sm:text-lg">
              Signed-out visitors can’t access budget data, so this page gives them a proper starting point: what VibeBudget does, why Google sign-in matters, and where to go next.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => void signIn()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-5 py-3 text-sm font-semibold text-[#022616] shadow-[0_18px_36px_rgba(6,183,127,0.28)] transition-transform hover:-translate-y-0.5"
              >
                <span>Continue with Google</span>
                <ArrowRight size={16} />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-3 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              >
                See how it works
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fintech-accent">Preview</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Your money rhythm, summarized</h2>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Status</p>
                  <p className="mt-1 text-sm font-semibold">Sign in required</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-[var(--app-border)] bg-[linear-gradient(180deg,_rgba(105,246,184,0.12)_0%,_rgba(105,246,184,0.03)_100%)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Monthly spend</p>
                  <p className="mt-3 text-3xl font-semibold">$2,480</p>
                  <p className="mt-2 text-xs text-fintech-accent">Down 8% vs prior range</p>
                </div>
                <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Saved this month</p>
                  <p className="mt-3 text-3xl font-semibold">$1,140</p>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">After rent, transport, and groceries</p>
                </div>
                <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">At-risk categories</p>
                  <p className="mt-3 text-3xl font-semibold">2</p>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">Dining and entertainment trending high</p>
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
                      transition={{ duration: 0.3, delay: 0.16 + index * 0.08 }}
                      className="flex gap-4 rounded-3xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-panel-strong)] text-fintech-accent">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-text-muted)]">{item.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
};
