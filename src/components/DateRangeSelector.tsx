import React, { useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { DateRange, DateRangeOption } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { formatDisplayDate, getPresetDateRange, resolveDateRange } from "../utils/dateUtils";
import { BottomSheet } from "./common/BottomSheet";
import { useBreakpoint } from "../hooks/useBreakpoint";

interface DateRangeSelectorProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ range, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { isDesktop } = useBreakpoint();
  const resolvedRange = resolveDateRange(range);

  const options: { label: string; value: DateRangeOption }[] = [
    { label: "This Month", value: "this-month" },
    { label: "Last Month", value: "last-month" },
    { label: "Last 3 Months", value: "last-3-months" },
    { label: "Last 6 Months", value: "last-6-months" },
    { label: "YTD", value: "ytd" },
    { label: "Last 12 Months", value: "last-12-months" },
    { label: "Custom Range", value: "custom" },
  ];

  const calculateRange = (option: DateRangeOption): DateRange => {
    switch (option) {
      case "custom":
        return range; // Keep current range for custom
      default:
        return getPresetDateRange(option);
    }
  };

  const handleOptionClick = (option: DateRangeOption) => {
    if (option === "custom") {
      setIsOpen(false);
      // Use the live preset dates as the starting point when switching to custom.
      onChange({ ...resolvedRange, option: "custom" });
    } else {
      onChange(calculateRange(option));
      setIsOpen(false);
    }
  };

  const getLabel = () => {
    if (resolvedRange.option === "custom") {
      return `${formatDisplayDate(resolvedRange.start)} - ${formatDisplayDate(resolvedRange.end)}`;
    }
    return options.find(o => o.value === resolvedRange.option)?.label || "Select Range";
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border bg-[var(--app-panel)] px-4 py-2 text-sm font-medium transition-all hover:border-fintech-accent/50"
        style={{ borderColor: "var(--app-border)" }}
      >
        <Calendar size={16} className="text-fintech-accent" />
        <span>{getLabel()}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isDesktop ? (
        <AnimatePresence>
          {isOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsOpen(false)} 
              />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border bg-fintech-card shadow-2xl"
                style={{ borderColor: "var(--app-border-strong)" }}
              >
                <div className="space-y-1 p-2">
                  {options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleOptionClick(opt.value)}
                      className={`w-full rounded-lg px-4 py-2.5 text-left text-sm transition-colors ${
                        resolvedRange.option === opt.value 
                          ? "bg-fintech-accent/10 font-bold text-fintech-accent" 
                          : "text-fintech-muted hover:bg-[var(--app-ghost)] hover:text-[var(--app-text)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      ) : (
        <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select Date Range">
          <div className="space-y-2">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleOptionClick(opt.value)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  resolvedRange.option === opt.value
                    ? "border-fintech-accent bg-fintech-accent/10 font-semibold text-fintech-accent"
                    : "bg-[var(--app-panel)] text-[var(--app-text)]"
                }`}
                style={resolvedRange.option === opt.value ? undefined : { borderColor: "var(--app-border)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {resolvedRange.option === "custom" && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 space-y-4 rounded-xl border bg-[var(--app-panel)] p-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-fintech-muted">Custom Range</span>
            <button onClick={() => handleOptionClick("this-month")} className="text-fintech-muted hover:text-[var(--app-text)]">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-fintech-muted font-bold">Start</label>
              <input
                type="date"
                value={resolvedRange.start}
                onChange={(e) => onChange({ ...resolvedRange, start: e.target.value })}
                className="w-full rounded-lg border bg-[var(--app-input)] px-2 py-2.5 text-xs"
                style={{ borderColor: "var(--app-border)" }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-fintech-muted font-bold">End</label>
              <input
                type="date"
                value={resolvedRange.end}
                onChange={(e) => onChange({ ...resolvedRange, end: e.target.value })}
                className="w-full rounded-lg border bg-[var(--app-input)] px-2 py-2.5 text-xs"
                style={{ borderColor: "var(--app-border)" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
