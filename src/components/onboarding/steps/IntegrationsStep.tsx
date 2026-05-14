import React from "react";
import { Database, FileSpreadsheet, Sparkles, ExternalLink } from "lucide-react";
import type { SettingsTab } from "../../Settings";

interface IntegrationCard {
  icon: React.ReactNode;
  name: string;
  description: string;
  tab: SettingsTab;
}

const INTEGRATION_CARDS: IntegrationCard[] = [
  {
    icon: <Database size={22} className="text-fintech-accent" />,
    name: "Bank Feed",
    description: "Connect Plaid or Teller to automatically import transactions from your bank.",
    tab: "finance_feeds",
  },
  {
    icon: <FileSpreadsheet size={22} className="text-fintech-accent" />,
    name: "Google Sheets",
    description: "Sync your budget with a Google Sheet for live updates and custom reporting.",
    tab: "google_workspace",
  },
  {
    icon: <Sparkles size={22} className="text-fintech-accent" />,
    name: "AI Provider",
    description: "Add a Gemini or DeepSeek API key to enable AI insights and document OCR.",
    tab: "ai",
  },
];

interface IntegrationsStepProps {
  onNext: () => void;
  onSkip: () => void;
  onNavigateToSettings: (tab: SettingsTab) => void;
}

export const IntegrationsStep: React.FC<IntegrationsStepProps> = ({
  onNext,
  onSkip,
  onNavigateToSettings,
}) => {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--app-text)]">Connect integrations</h3>
        <p className="text-sm text-fintech-muted mt-1">
          Optional — connect your bank, spreadsheet, or AI provider. You can set these up later in Settings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {INTEGRATION_CARDS.map((card) => (
          <div
            key={card.tab}
            className="flex items-start gap-4 rounded-xl border p-4"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-fintech-accent/10">
              {card.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--app-text)]">{card.name}</p>
              <p className="mt-0.5 text-xs text-fintech-muted leading-relaxed">{card.description}</p>
            </div>
            <button
              onClick={() => onNavigateToSettings(card.tab)}
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-panel)] transition-colors"
              style={{ borderColor: "var(--app-border)" }}
            >
              <ExternalLink size={12} />
              Set up
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onSkip}
          className="text-sm text-fintech-muted hover:text-[var(--app-text)] transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          className="rounded-xl bg-fintech-accent px-6 py-2.5 text-sm font-semibold text-[#002919] hover:bg-fintech-accent/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
