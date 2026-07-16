"use client";

import { useEffect, useState } from "react";

// Mirrors Tailwind's `lg` breakpoint (1024px) — below it, KitchenBuilder shows
// one full-screen panel at a time instead of the desktop 3-column layout.
const QUERY = "(max-width: 1023px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
