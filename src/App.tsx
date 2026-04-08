import React, { useState } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { Analysis } from "./components/Analysis";
import { Settings } from "./components/Settings";
import { DateRangeSelector } from "./components/DateRangeSelector";
import { TransactionsView } from "./components/TransactionsView";
import { formatDate } from "./utils/dateUtils";
import { View, DateRange } from "./types";
import { useFirebase } from "./contexts/FirebaseContext";

export default function App() {
  const { loading, expenseCategories, incomeCategories, transactions, income, updateExpenseCategoryTarget } = useFirebase();
  const [view, setView] = useState<View>("dashboard");

  // Default date range: This Month
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date();
    const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = formatDate(now);
    return { start, end, option: "this-month" };
  });

  const filteredTransactions = transactions.filter(t => t.date >= dateRange.start && t.date <= dateRange.end);
  const filteredIncome = income.filter(i => i.date >= dateRange.start && i.date <= dateRange.end);

  const getPreviousDateRange = (range: DateRange) => {
    const start = new Date(range.start + 'T00:00:00');
    const end = new Date(range.end + 'T00:00:00');
    
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
        const expectedMonth = (end.getMonth() - months + 120) % 12; // +120 to handle negative
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

    // Custom
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const prevStart = new Date(start.getTime() - (diffDays + 1) * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(start.getTime() - 1 * 24 * 60 * 60 * 1000);
    
    return { start: formatDate(prevStart), end: formatDate(prevEnd) };
  };

  const prevRange = getPreviousDateRange(dateRange);
  const previousTransactions = transactions.filter(t => t.date >= prevRange.start && t.date <= prevRange.end);
  const previousIncome = income.filter(i => i.date >= prevRange.start && i.date <= prevRange.end);

  const getMonthMultiplier = () => {
    if (dateRange.option === "this-month") return 1;
    if (dateRange.option === "last-month") return 1;
    if (dateRange.option === "last-3-months") return 3;
    if (dateRange.option === "last-6-months") return 6;
    if (dateRange.option === "last-12-months") return 12;
    
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    // Otherwise prorate by days (approx 30 days per month)
    return diffDays / 30;
  };

  const monthMultiplier = getMonthMultiplier();

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                <p className="mt-1 text-xs text-fintech-muted">Track your balance, budget targets, and financial momentum.</p>
              </div>
              <DateRangeSelector range={dateRange} onChange={setDateRange} />
            </div>
            <Dashboard 
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              transactions={filteredTransactions} 
              income={filteredIncome}
              previousTransactions={previousTransactions}
              previousIncome={previousIncome}
              allTransactions={transactions}
              onViewHistory={() => setView("transactions")}
              onUpdateTarget={updateExpenseCategoryTarget}
              monthMultiplier={monthMultiplier}
            />
          </div>
        );
      case "transactions":
        return (
            <TransactionsView 
              transactions={transactions}
              income={income}
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              onRefresh={() => {}} // Firestore handles real-time updates
            />
        );
      case "analysis":
        return (
          <div className="space-y-6">
            <Analysis 
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              transactions={transactions} 
              income={income} 
              allTransactions={transactions}
              allIncome={income}
              currentRange={dateRange}
            />
          </div>
        );
      case "settings":
        return <Settings onRefresh={() => {}} />;
      default:
        return <Dashboard expenseCategories={expenseCategories} incomeCategories={incomeCategories} transactions={filteredTransactions} income={filteredIncome} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-fintech-bg text-fintech-accent">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-fintech-accent"></div>
      </div>
    );
  }

  return (
    <Layout currentView={view} setView={setView}>
      {renderView()}
    </Layout>
  );
}
