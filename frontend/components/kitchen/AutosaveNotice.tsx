"use client";

import { useEffect, useState } from "react";

interface AutosaveNoticeProps {
  // "new" for a not-yet-saved draft, otherwise the numeric project id as a
  // string — keeps the sessionStorage key stable per actual project.
  projectKey: string;
  autosaveEnabled: boolean;
  isDraft: boolean;
}

// Shown once per project per tab session (sessionStorage-keyed), not on
// every autosave tick — reappears in a genuinely new tab but not on every
// render/autosave within the same visit.
export function AutosaveNotice({ projectKey, autosaveEnabled, isDraft }: AutosaveNoticeProps) {
  const storageKey = `kitchen-autosave-notice:${projectKey}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't mark the notice "shown" on a run where nothing would actually
    // render — otherwise, if autosaveEnabled/isDraft only becomes true later
    // in the same tab session, the banner never appears for that session
    // because the flag was already set on a run that showed nothing.
    if (!autosaveEnabled && !isDraft) return;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
    setVisible(true);
  }, [storageKey, autosaveEnabled, isDraft]);

  if (!visible || (!autosaveEnabled && !isDraft)) return null;

  const parts: string[] = [];
  if (autosaveEnabled) {
    parts.push(
      "Guardado automático activado — este proyecto se guardará automáticamente mientras trabajas. Puedes desactivarlo desde la configuración del proyecto."
    );
  }
  if (isDraft) {
    parts.push(
      "Proyecto borrador — este proyecto todavía no tiene un cliente asignado. Tus cambios se guardarán automáticamente."
    );
  }

  return (
    <div className="flex items-start gap-3 border-b border-brass/25 bg-brass/8 px-4 py-2.5 text-xs text-ivory/90">
      <p className="flex-1">{parts.join(" ")}</p>
      <button onClick={() => setVisible(false)} aria-label="Cerrar aviso" className="shrink-0 text-warmgray hover:text-ivory">
        ✕
      </button>
    </div>
  );
}
