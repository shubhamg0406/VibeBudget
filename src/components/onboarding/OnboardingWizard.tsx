import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { WelcomeStep } from "./steps/WelcomeStep";
import { CurrencyStep } from "./steps/CurrencyStep";
import { CategoriesStep } from "./steps/CategoriesStep";
import { FirstTransactionStep } from "./steps/FirstTransactionStep";
import { DoneStep } from "./steps/DoneStep";
import { useFirebase } from "../../contexts/FirebaseContext";

interface OnboardingWizardProps {
  onComplete: () => void;
  onNavigateToSettings: (tab: string) => void;
}

const TOTAL_STEPS = 5;

const STEP_LABELS = [
  "Welcome",
  "Currency",
  "Budgets",
  "First Transaction",
  "Done",
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
}) => {
  const { saveOnboardingStep, onboardingStep } = useFirebase();

  const [step, setStep] = useState<number>(() =>
    Math.min(Math.max(onboardingStep, 0), TOTAL_STEPS - 1)
  );

  const [currencySet, setCurrencySet] = useState(false);
  const [budgetsSet, setBudgetsSet] = useState(false);
  const [transactionAdded, setTransactionAdded] = useState(false);

  const advanceTo = (nextStep: number) => {
    setStep(nextStep);
    void saveOnboardingStep(nextStep).catch(() => undefined);
  };

  const handleBack = () => {
    if (step > 0) advanceTo(step - 1);
  };

  const progressPercent = (step / (TOTAL_STEPS - 1)) * 100;

  const renderStep = () => {
    switch (step) {
      case 0:
        return <WelcomeStep onNext={() => advanceTo(1)} />;
      case 1:
        return (
          <CurrencyStep
            onNext={() => { setCurrencySet(true); advanceTo(2); }}
          />
        );
      case 2:
        return (
          <CategoriesStep
            onNext={() => { setBudgetsSet(true); advanceTo(3); }}
            onSkip={() => advanceTo(3)}
          />
        );
      case 3:
        return (
          <FirstTransactionStep
            onNext={() => { setTransactionAdded(true); advanceTo(4); }}
            onSkip={() => advanceTo(4)}
          />
        );
      case 4:
        return (
          <DoneStep
            currencySet={currencySet}
            budgetsSet={budgetsSet}
            transactionAdded={transactionAdded}
            onFinish={onComplete}
          />
        );
      default:
        return null;
    }
  };

  const canGoBack = step > 0 && step < TOTAL_STEPS - 1;
  const isFirstOrLast = step === 0 || step === TOTAL_STEPS - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-shell)] p-4">
      <div
        className="w-full max-w-2xl rounded-2xl border bg-[var(--app-panel)] shadow-2xl flex flex-col overflow-hidden"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-[var(--app-shell)] flex-shrink-0">
          <div
            className="h-full bg-fintech-accent transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step label + counter */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: "var(--app-border)" }}
        >
          <span className="text-xs font-medium text-fintech-muted uppercase tracking-wider">
            {STEP_LABELS[step]}
          </span>
          <span className="text-xs text-fintech-muted">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          {renderStep()}
        </div>

        {/* Footer */}
        {!isFirstOrLast && canGoBack && (
          <div
            className="flex items-center justify-between px-6 py-4 border-t"
            style={{ borderColor: "var(--app-border)" }}
          >
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-fintech-muted hover:text-[var(--app-text)] transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <span className="text-xs text-fintech-muted">
              {TOTAL_STEPS - step - 1} step{TOTAL_STEPS - step - 1 !== 1 ? "s" : ""} remaining
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
