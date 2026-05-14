import React from "react";
import { Sparkles } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-fintech-accent/10">
        <Sparkles size={32} className="text-fintech-accent" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-[var(--app-text)]">
          Welcome to VibeBudget
        </h2>
        <p className="text-base text-fintech-muted max-w-md">
          The private, self-hosted budget tracker that keeps your financial data under your control.
        </p>
        <p className="text-sm text-fintech-muted">
          Let&apos;s get you set up — takes 2 minutes.
        </p>
      </div>
      <button
        onClick={onNext}
        className="mt-2 rounded-xl bg-fintech-accent px-8 py-3 text-sm font-semibold text-[#002919] hover:bg-fintech-accent/90 transition-colors"
      >
        Get Started
      </button>
    </div>
  );
};
