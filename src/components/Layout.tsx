import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleHelp,
  Home,
  List,
  LogIn,
  LogOut,
  Moon,
  Search,
  Settings as SettingsIcon,
  SunMedium,
  Upload,
  User,
  Wallet2
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Theme, View } from "../types";
import { useFirebase } from "../contexts/FirebaseContext";
import { BottomNav } from "./nav/BottomNav";
import { DataHub } from "./DataHub";

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  setView: (view: View) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

const PAGE_META: Record<View, { title: string; searchPlaceholder: string }> = {
  dashboard: { title: "Dashboard", searchPlaceholder: "Search insights..." },
  transactions: { title: "Transactions", searchPlaceholder: "Search transactions..." },
  analysis: { title: "Stats", searchPlaceholder: "Search insights..." },
  settings: { title: "Settings", searchPlaceholder: "Search settings..." },
};

export const Layout: React.FC<LayoutProps> = ({ children, currentView, setView, theme, onToggleTheme }) => {
  const { user, signIn, logout } = useFirebase();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showDataHub, setShowDataHub] = useState(false);

  const navItems = useMemo(() => ([
    { id: "dashboard", icon: Home, label: "Home" },
    { id: "transactions", icon: List, label: "Transactions" },
    { id: "analysis", icon: BarChart3, label: "Stats" },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ]), []);

  const pageMeta = PAGE_META[currentView];
  const isLight = theme === "light";

  return (
    <div className="h-screen overflow-hidden bg-[var(--app-shell)] text-[var(--app-text)]">
      <div className="flex h-full min-h-0 w-full">
        <aside
          className="hidden h-screen w-60 shrink-0 flex-col border-r bg-[var(--app-sidebar)] shadow-[var(--app-shadow)] backdrop-blur-xl lg:flex"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex h-full flex-col py-8">
            <div className="mb-10 px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--app-panel-strong)] text-fintech-accent">
                  <Wallet2 size={20} />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight leading-none text-fintech-accent">
                    Vibe<span className="text-fintech-accent">Budget</span>
                  </h1>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-fintech-muted/70">
                    Budget Tracker
                  </p>
                </div>
              </div>
            </div>

            <nav className="flex flex-1 flex-col space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id as View)}
                    className={`relative flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-200 ${
                      isActive
                        ? "border-l-4 border-fintech-accent bg-[var(--app-panel-strong)] font-bold text-fintech-accent"
                        : "text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                    }`}
                  >
                    <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                    <span className="text-[13px] font-medium tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto space-y-2">
              <button className="flex w-full items-center gap-3 px-5 py-2.5 text-[var(--app-text-muted)] transition-colors duration-200 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]">
                <CircleHelp size={18} />
                <span className="text-[13px] font-medium tracking-tight">Help</span>
              </button>
              <button
                onClick={() => logout()}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-[var(--app-text-muted)] transition-colors duration-200 hover:bg-[var(--app-hover)] hover:text-fintech-danger"
              >
                <LogOut size={18} />
                <span className="text-[13px] font-medium tracking-tight">Logout</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            className="z-40 flex h-[72px] shrink-0 items-center justify-between border-b bg-[color:var(--app-shell)]/70 px-4 backdrop-blur-md sm:px-6"
            style={{ borderColor: "var(--app-border)" }}
          >
            <h2 className="text-lg font-semibold tracking-tight text-[var(--app-text)]">{pageMeta.title}</h2>

            <div className="flex items-center gap-5">
              <div className="flex items-center justify-between gap-5">
                <div className="relative hidden xl:block">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fintech-muted" size={16} />
                  <input
                    type="text"
                    placeholder={pageMeta.searchPlaceholder}
                    className="w-[280px] rounded-lg border bg-[var(--app-input)] py-2 pl-10 pr-4 text-[13px] text-[var(--app-text)] placeholder:text-[var(--app-text-muted)]"
                    style={{ borderColor: "var(--app-border)" }}
                  />
                </div>
                <button
                  onClick={onToggleTheme}
                  className="inline-flex items-center gap-2 rounded-full border bg-[var(--app-panel)] px-3 py-2 text-[12px] font-semibold text-[var(--app-text-muted)] transition-colors hover:border-fintech-accent/40 hover:text-fintech-accent"
                  style={{ borderColor: "var(--app-border)" }}
                  aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
                >
                  {isLight ? <Moon size={15} /> : <SunMedium size={15} />}
                  <span>{isLight ? "Dark" : "Light"}</span>
                </button>
                <button
                  onClick={() => setShowDataHub(true)}
                  className="relative text-fintech-muted transition-colors hover:text-fintech-accent"
                  title="Data Hub — Import & Refresh"
                >
                  <Upload size={19} />
                </button>
                <button className="text-fintech-muted transition-colors hover:text-fintech-accent">
                  <CalendarDays size={19} />
                </button>
                <button className="relative text-fintech-muted transition-colors hover:text-fintech-accent">
                  <Bell size={19} />
                  <span className="absolute -right-0.5 -top-1 h-2 w-2 rounded-full bg-[#ff716a]" />
                </button>
              </div>
              <div className="h-8 w-px bg-[var(--app-divider)]" />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowProfileMenu((value) => !value)}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border bg-[var(--app-panel-strong)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User size={16} className="text-[var(--app-text)]" />
                  )}
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto mobile-main-offset">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              className="mx-auto w-full max-w-7xl p-4 sm:p-6"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
      <BottomNav currentView={currentView} setView={setView} />

      <AnimatePresence>
        {showProfileMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileMenu(false)}
              className="fixed inset-0 z-[61]"
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              className="fixed right-8 top-24 z-[62] w-64 rounded-xl border bg-[var(--app-panel)] p-3 shadow-2xl backdrop-blur-xl"
              style={{ borderColor: "var(--app-border-strong)" }}
            >
              {user ? (
                <div className="space-y-2">
                  <div
                    className="rounded-2xl border bg-[var(--app-ghost)] px-4 py-3"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <p className="truncate text-sm font-semibold">{user.displayName || "User"}</p>
                    <p className="truncate text-xs text-fintech-muted">{user.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-fintech-danger transition-colors hover:bg-[var(--app-ghost)]"
                  >
                    <LogOut size={18} />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    signIn();
                    setShowProfileMenu(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-fintech-accent transition-colors hover:bg-[var(--app-ghost)]"
                >
                  <LogIn size={18} />
                  <span>Sign In with Google</span>
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showDataHub && <DataHub onClose={() => setShowDataHub(false)} />}
    </div>
  );
};
