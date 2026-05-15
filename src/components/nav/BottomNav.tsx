import React from "react";
import { BarChart3, CalendarCheck, Home, List, Settings as SettingsIcon } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { View } from "../../types";

const navItems: Array<{ id: View; path: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { id: "dashboard", path: "/", label: "Dashboard", icon: Home },
  { id: "transactions", path: "/transactions", label: "Transactions", icon: List },
  { id: "analysis", path: "/stats", label: "Stats", icon: BarChart3 },
  { id: "monthly-analysis", path: "/stats/monthly", label: "Monthly", icon: CalendarCheck },
  { id: "settings", path: "/settings", label: "Settings", icon: SettingsIcon },
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[80] flex items-center justify-around border-t bg-[color:var(--app-sidebar)]/95 px-2 pt-2 backdrop-blur-xl lg:hidden"
      style={{ borderColor: "var(--app-border)", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.id === "dashboard"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
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
