import React from "react";
import { Plus } from "lucide-react";

interface FABProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export const FAB: React.FC<FABProps> = ({ onClick, label = "Add transaction", className }) => {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`inline-flex h-14 min-w-[4.5rem] items-center justify-center rounded-full bg-[linear-gradient(135deg,_#63f0bf_0%,_#31c987_100%)] px-5 text-[#07121f] shadow-[0_18px_40px_rgba(73,240,181,0.26)] transition-transform hover:scale-105 active:scale-95 ${className || ""}`}
    >
      <Plus size={26} />
    </button>
  );
};
