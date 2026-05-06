import React from "react";
import { EmptyState } from "./common/EmptyState";
import {
  Receipt,
  BarChart3,
  TrendingUp,
  CalendarCheck,
  PiggyBank,
  Repeat,
  Database,
  Sparkles,
} from "lucide-react";

const PREVIEW_ENABLED = typeof window !== "undefined" &&
  (import.meta.env.VITE_LOCAL_TEST_MODE === "1" ||
   import.meta.env.VITE_DEV === "true" ||
   window.location.hash === "#empty-states");

interface DevSectionProps {
  title: string;
  children: React.ReactNode;
}

const DevSection: React.FC<DevSectionProps> = ({ title, children }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">{title}</h3>
    <div className="space-y-3">{children}</div>
  </div>
);

export const EmptyStatePreview: React.FC = () => {
  if (!PREVIEW_ENABLED) return null;

  return (
    <div className="space-y-8 p-6">
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        Dev Only: Empty State Preview — remove <code>#empty-states</code> from URL to hide
      </div>

      <DevSection title="Dashboard Empty States">
        <EmptyState
          icon={Receipt}
          title="No activity yet"
          description="Add your first transaction to unlock forecasts, savings signals, and cashflow insights on this dashboard."
          action={{ label: "Go to Transactions", onClick: () => {} }}
          compact
        />
        <EmptyState
          icon={Sparkles}
          title="No expense categories yet"
          description="Expense categories appear once you add transactions or import data."
          compact
        />
        <EmptyState
          icon={Sparkles}
          title="No income targets set"
          description="Set income category targets in Settings to track where your money comes from."
          compact
        />
      </DevSection>

      <DevSection title="Chart Empty States">
        <EmptyState
          icon={BarChart3}
          title="No cashflow data yet"
          description="Add income and expenses to see your monthly cashflow trends over time."
          compact
        />
        <EmptyState
          icon={TrendingUp}
          title="No expenses to distribute"
          description="Add expenses to see how your spending is distributed across categories."
          compact
        />
      </DevSection>

      <DevSection title="Monthly Analysis Empty States">
        <EmptyState
          icon={CalendarCheck}
          title="No activity this month"
          description="Add transactions for this month to see your monthly breakdown."
        />
        <EmptyState
          icon={CalendarCheck}
          title="No expenses recorded this month"
          description="Add expenses to see your category spending breakdown."
          compact
        />
        <EmptyState
          icon={PiggyBank}
          title="No budget targets set"
          description="Set category targets in Settings to track your budget health."
          compact
        />
      </DevSection>

      <DevSection title="Transactions Empty States">
        <EmptyState
          icon={Repeat}
          title="No recurring entries in the next 30 days"
          description="Set up a recurring transaction to see projections here."
          compact
        />
      </DevSection>

      <DevSection title="Data Hub Empty States">
        <EmptyState
          icon={Database}
          title="No imported data yet"
          description="Connect a Google Sheet, upload a CSV, or import from Excel to get started."
          action={{ label: "Open Data Hub", onClick: () => {} }}
        />
      </DevSection>
    </div>
  );
};
