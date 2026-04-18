import { useEffect, useMemo, useState } from "react";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

const getBreakpointFromWidth = (width: number): Breakpoint => {
  if (width >= 1280) return "xl";
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  if (width >= 640) return "sm";
  return "xs";
};

const getWindowWidth = () => {
  if (typeof window === "undefined") return 1280;
  return window.innerWidth;
};

export const useBreakpoint = () => {
  const [width, setWidth] = useState<number>(() => getWindowWidth());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const breakpoint = useMemo(() => getBreakpointFromWidth(width), [width]);
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;
  const isDesktop = width >= 1024;

  return {
    width,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
  };
};
