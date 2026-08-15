"use client";

import { useEffect, useState } from "react";
import type { AutosaveStatus } from "@/hooks/useKitchenAutosave";

function relativeLabel(atMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (seconds < 60) return `Guardado hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `Guardado hace ${minutes} min`;
}

export function AutosaveStatusLabel({ status, autosaveEnabled }: { status: AutosaveStatus; autosaveEnabled: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status.kind !== "saved") return;
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [status]);

  if (!autosaveEnabled) {
    return <span className="text-[11px] text-amber-300/80 whitespace-nowrap">Guardado automático desactivado</span>;
  }
  if (status.kind === "saving") return <span className="text-[11px] text-warmgray whitespace-nowrap">Guardando…</span>;
  if (status.kind === "saved") return <span className="text-[11px] text-warmgray whitespace-nowrap">{relativeLabel(status.at, now)}</span>;
  if (status.kind === "error") return <span className="text-[11px] text-rose-300 whitespace-nowrap">Error al guardar</span>;
  return null;
}
