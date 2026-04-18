import React from "react";
import { BarChart3, Home, List, Settings as SettingsIcon } from "lucide-react";
import { View } from "../../types";

interface BottomNavProps {
  currentView: View;
  setView: (view: View) => void;
}

const navItems: Array<{ id: View; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "transactions", label: "Transactions", icon: List },
  { id: "analysis", label: "Stats", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, setView }) => {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[80] flex items-center justify-around border-t bg-[color:var(--app-sidebar)]/95 px-2 pt-2 backdrop-blur-xl lg:hidden"
      style={{ borderColor: "var(--app-border)", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors ${
              isActive ? "text-fintech-accent" : "text-fintech-muted"
            }`}
          >
            <Icon size={20} strokeWidth={isActive ? 2.3 : 2} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
