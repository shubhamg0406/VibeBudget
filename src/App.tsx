import React, { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { Analysis } from "./components/Analysis";
import { MonthlyAnalysis } from "./components/MonthlyAnalysis";
import { Settings } from "./components/Settings";
import { DateRangeSelector } from "./components/DateRangeSelector";
import { TransactionsView } from "./components/TransactionsView";
import { LoggedOutHome } from "./components/LoggedOutHome";
import { AiChat } from "./components/AiChat";
import { Docs } from "./components/Docs";
import { formatDate, getMonthCountForDateRangeOption, getPresetDateRange, isDateInRange, parseDateString, resolveDateRange } from "./utils/dateUtils";
import { View, DateRange, Theme } from "./types";
import { useFirebase } from "./contexts/FirebaseContext";
import type { SettingsTab } from "./components/Settings";

function viewFromPath(pathname: string): View {
  if (pathname.startsWith("/docs")) return "docs";
  if (pathname.startsWith("/transactions")) return "transactions";
  if (pathname === "/stats/monthly") return "monthly-analysis";
  if (pathname.startsWith("/stats")) return "analysis";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}

function tabToSlug(tab: SettingsTab): string {
  return tab.replace(/_/g, "-");
}

function slugToTab(slug: string): SettingsTab {
  return slug.replace(/-/g, "_") as SettingsTab;
}

function SettingsRoute({ onRefresh, onTabChange }: { onRefresh: () => void; onTabChange: (tab: SettingsTab) => void }) {
  const { tab } = useParams<{ tab: string }>();
  const initialTab = slugToTab(tab ?? "data");
  return <Settings onRefresh={onRefresh} initialTab={initialTab} onTabChange={onTabChange} />;
}

export default function App() {
  const {
    loading,
    user,
    authError,
    clearAuthError,
    logout,
    expenseCategories,
    incomeCategories,
    transactions,
    income,
    updateExpenseCategoryTarget,
    onboardingCompleted,
  } = useFirebase();

  const navigate = useNavigate();
  const location = useLocation();
  const view = viewFromPath(location.pathname);

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem("vibebudget-theme");
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
  });

  const onNavigate = (targetView: View, targetSection?: SettingsTab) => {
    switch (targetView) {
      case "dashboard": navigate("/"); break;
      case "transactions": navigate("/transactions"); break;
      case "analysis": navigate("/stats"); break;
      case "monthly-analysis": navigate("/stats/monthly"); break;
      case "settings": navigate(`/settings/${tabToSlug(targetSection ?? "data")}`); break;
      case "docs": navigate("/docs"); break;
    }
  };

  // Default date range: This Month
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetDateRange("this-month"));
  const effectiveDateRange = resolveDateRange(dateRange);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("vibebudget-theme", theme);
  }, [theme]);

  useEffect(() => {
    const onFocusRange = (event: Event) => {
      const customEvent = event as CustomEvent<{ start?: string; end?: string }>;
      const start = customEvent.detail?.start;
      const end = customEvent.detail?.end;
      if (!start || !end) return;
      setDateRange({ option: "custom", start, end });
    };
    window.addEventListener("vibebudget:focus-date-range", onFocusRange);
    return () => window.removeEventListener("vibebudget:focus-date-range", onFocusRange);
  }, []);

  const filteredTransactions = transactions.filter((t) => isDateInRange(t.date, effectiveDateRange.start, effectiveDateRange.end));
  const filteredIncome = income.filter((i) => isDateInRange(i.date, effectiveDateRange.start, effectiveDateRange.end));

  const getPreviousDateRange = (range: DateRange) => {
    const start = parseDateString(range.start);
    const end = parseDateString(range.end);

    const isLastDayOfMonth = (date: Date) => {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      return nextDay.getDate() === 1;
    };

    const shiftMonths = (months: number) => {
      const prevStart = new Date(start.getFullYear(), start.getMonth() - months, 1);
      let prevEnd;
      if (isLastDayOfMonth(end)) {
        prevEnd = new Date(end.getFullYear(), end.getMonth() - months + 1, 0);
      } else {
        prevEnd = new Date(end.getFullYear(), end.getMonth() - months, end.getDate());
        const expectedMonth = (end.getMonth() - months + 120) % 12;
        if (prevEnd.getMonth() !== expectedMonth) prevEnd.setDate(0);
      }
      return { start: formatDate(prevStart), end: formatDate(prevEnd) };
    };

    if (range.option === "this-month" || range.option === "last-month") return shiftMonths(1);
    if (range.option === "last-3-months") return shiftMonths(3);
    if (range.option === "last-6-months") return shiftMonths(6);
    if (range.option === "last-12-months") return shiftMonths(12);

    if (range.option === "ytd") {
      const prevStart = new Date(start.getFullYear() - 1, 0, 1);
      let prevEnd;
      if (isLastDayOfMonth(end) && end.getMonth() === 11) {
        prevEnd = new Date(end.getFullYear() - 1, 11, 31);
      } else {
        prevEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
      }
      return { start: formatDate(prevStart), end: formatDate(prevEnd) };
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start.getTime() - (diffDays + 1) * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(start.getTime() - 1 * 24 * 60 * 60 * 1000);
    return { start: formatDate(prevStart), end: formatDate(prevEnd) };
  };

  const prevRange = getPreviousDateRange(effectiveDateRange);
  const previousTransactions = transactions.filter((t) => isDateInRange(t.date, prevRange.start, prevRange.end));
  const previousIncome = income.filter((i) => isDateInRange(i.date, prevRange.start, prevRange.end));

  const getMonthMultiplier = () => {
    const presetMonthCount = getMonthCountForDateRangeOption(effectiveDateRange.option);
    if (presetMonthCount) return presetMonthCount;
    const start = parseDateString(effectiveDateRange.start);
    const end = parseDateString(effectiveDateRange.end);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays / 30;
  };

  const monthMultiplier = getMonthMultiplier();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-shell)] text-fintech-accent">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-fintech-accent"></div>
      </div>
    );
  }

  if (view === "docs") {
    return (
      <Docs
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (!user) {
    return (
      <LoggedOutHome
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        onOpenDocs={() => navigate("/docs")}
      />
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
        <div className="w-full max-w-xl rounded-2xl border bg-[var(--app-panel)] p-6 text-[var(--app-text)]" style={{ borderColor: "var(--app-border)" }}>
          <h1 className="text-xl font-bold">Couldn&apos;t Load Your Data</h1>
          <p className="mt-3 text-sm text-fintech-muted">{authError}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => { clearAuthError(); window.location.reload(); }}
              className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-semibold text-[#002919]"
            >
              Retry
            </button>
            <button
              onClick={() => void logout()}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--app-border)" }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dashboardElement = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-xs text-fintech-muted">Track your balance, budget targets, and financial momentum.</p>
        </div>
        <DateRangeSelector range={effectiveDateRange} onChange={setDateRange} />
      </div>
      <Dashboard
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        transactions={filteredTransactions}
        income={filteredIncome}
        previousTransactions={previousTransactions}
        previousIncome={previousIncome}
        allTransactions={transactions}
        allIncome={income}
        onViewHistory={() => onNavigate("transactions")}
        onNavigate={(v, section) => onNavigate(v, section)}
        onUpdateTarget={updateExpenseCategoryTarget}
        monthMultiplier={monthMultiplier}
      />
    </div>
  );

  const transactionsElement = (
    <TransactionsView
      transactions={transactions}
      income={income}
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      onRefresh={() => {}}
    />
  );

  const analysisElement = (
    <div className="space-y-6">
      <Analysis
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        transactions={transactions}
        income={income}
        allTransactions={transactions}
        allIncome={income}
        currentRange={effectiveDateRange}
      />
    </div>
  );

  const monthlyAnalysisElement = (
    <div className="space-y-4">
      <MonthlyAnalysis
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        allTransactions={transactions}
        allIncome={income}
      />
    </div>
  );

  return (
    <>
      <Layout
        currentView={view}
        onNavigate={onNavigate}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        onOpenDocs={() => navigate("/docs")}
      >
        <Routes>
          <Route path="/" element={dashboardElement} />
          <Route path="/transactions" element={transactionsElement} />
          <Route path="/stats" element={analysisElement} />
          <Route path="/stats/monthly" element={monthlyAnalysisElement} />
          <Route path="/settings" element={<Navigate to="/settings/data" replace />} />
          <Route
            path="/settings/:tab"
            element={
              <SettingsRoute
                onRefresh={() => {}}
                onTabChange={(tab) => navigate(`/settings/${tabToSlug(tab)}`)}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <AiChat />
      {!onboardingCompleted && (
        <OnboardingWizard
          onComplete={() => undefined}
          onNavigateToSettings={() => undefined}
        />
      )}
    </>
  );
}
