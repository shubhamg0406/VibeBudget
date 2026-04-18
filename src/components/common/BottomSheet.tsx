import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useBreakpoint } from "../../hooks/useBreakpoint";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  fullScreen?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  fullScreen = false,
}) => {
  const { isDesktop } = useBreakpoint();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const sheetClass = isDesktop
    ? "relative w-full max-w-2xl rounded-[1.75rem] border bg-fintech-bg p-6 shadow-2xl"
    : fullScreen
      ? "relative h-[100dvh] w-full rounded-none border-x-0 border-b-0 border-t bg-fintech-bg"
      : "relative max-h-[88dvh] w-full rounded-t-[1.75rem] border border-b-0 bg-fintech-bg";

  const initialY = isDesktop ? 16 : "100%";
  const animateY = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{ backgroundColor: "var(--app-overlay)" }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title || "Sheet"}
            initial={{ opacity: 0, y: initialY }}
            animate={{ opacity: 1, y: animateY }}
            exit={{ opacity: 0, y: initialY }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className={sheetClass}
            style={{ borderColor: "var(--app-border-strong)", willChange: "transform" }}
          >
            {!isDesktop && !fullScreen && (
              <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-[var(--app-border-strong)]" />
            )}
            {(title || fullScreen || !isDesktop) && (
              <div
                className={`sticky top-0 z-10 flex items-center justify-between border-b bg-fintech-bg ${fullScreen ? "px-4 py-4" : "px-4 py-3 sm:px-6"}`}
                style={{ borderColor: "var(--app-border)" }}
              >
                <h3 className="text-sm font-semibold text-[var(--app-text)]">{title || "Details"}</h3>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fintech-muted transition-colors hover:bg-[var(--app-ghost)] hover:text-[var(--app-text)]"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <div className={fullScreen ? "h-[calc(100dvh-72px)] overflow-y-auto p-4 pb-8" : "max-h-[calc(88dvh-70px)] overflow-y-auto p-4 pb-6 sm:px-6"}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
