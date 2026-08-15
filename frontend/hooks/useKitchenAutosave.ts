"use client";

import { useEffect, useRef, useState } from "react";
import { saveKitchenProject } from "@/services/api";
import { createDebouncedMaxWaitScheduler } from "@/services/autosaveScheduler";
import type { KitchenDraft } from "@/types/kitchen";

const DEBOUNCE_MS = 2500;
const MAX_WAIT_MS = 20000;

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

interface UseKitchenAutosaveArgs {
  draft: KitchenDraft;
  projectId: number | null;
  enabled: boolean;
  onProjectCreated: (id: number) => void;
}

// Autosaves `draft` to the backend on the same debounce+maxWait schedule the
// design doc calls for, using the exact same saveKitchenProject() the manual
// Guardar button uses — no parallel save path. Also doubles as "lazy backend
// creation": since saveKitchenProject(draft, null) already POSTs a brand-new
// project, the very first real change on an unsaved draft creates its
// backend row as a side effect of the normal autosave schedule, with no
// special-cased "first save" code path.
export function useKitchenAutosave({ draft, projectId, enabled, onProjectCreated }: UseKitchenAutosaveArgs): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });

  // Refs so the scheduler's callback (captured once, see below) always reads
  // the latest values instead of the ones from the render it was created in.
  const draftRef = useRef(draft);
  const projectIdRef = useRef(projectId);
  const enabledRef = useRef(enabled);
  const onProjectCreatedRef = useRef(onProjectCreated);
  draftRef.current = draft;
  projectIdRef.current = projectId;
  enabledRef.current = enabled;
  onProjectCreatedRef.current = onProjectCreated;

  const pendingRef = useRef(false);
  const savingRef = useRef(false);
  const schedulerRef = useRef<ReturnType<typeof createDebouncedMaxWaitScheduler> | null>(null);

  const flush = () => {
    if (!pendingRef.current || !enabledRef.current) return;
    if (savingRef.current) {
      // A save is already in flight — retry shortly instead of losing this edit.
      schedulerRef.current?.trigger();
      return;
    }
    pendingRef.current = false;
    savingRef.current = true;
    setStatus({ kind: "saving" });
    saveKitchenProject(draftRef.current, projectIdRef.current)
      .then((savedId) => {
        if (projectIdRef.current === null) {
          projectIdRef.current = savedId;
          onProjectCreatedRef.current(savedId);
        }
        setStatus({ kind: "saved", at: Date.now() });
      })
      .catch((error: unknown) => {
        // Leave the edit unflushed so the next change or flush retries it,
        // instead of silently dropping it. No toast here — that's the loud
        // version the manual Guardar button already covers; this is the
        // persistent quiet one (see the status indicator in the UI).
        pendingRef.current = true;
        setStatus({ kind: "error", message: error instanceof Error ? error.message : "No fue posible guardar." });
      })
      .finally(() => {
        savingRef.current = false;
      });
  };

  useEffect(() => {
    schedulerRef.current = createDebouncedMaxWaitScheduler(flush, DEBOUNCE_MS, MAX_WAIT_MS);
    return () => schedulerRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fires on every real draft mutation. Two cases must NOT count as a user
  // edit: the initial mount, and a fresh loadProject()-style swap (draft and
  // projectId change together when navigating to a different saved project)
  // — both are guarded against here instead of scheduling a spurious save
  // right after a project loads.
  const hasMountedRef = useRef(false);
  const lastProjectIdRef = useRef(projectId);
  useEffect(() => {
    const isFirstRun = !hasMountedRef.current;
    hasMountedRef.current = true;
    const projectSwapped = projectId !== lastProjectIdRef.current;
    lastProjectIdRef.current = projectId;

    if (isFirstRun || projectSwapped) return;
    if (!enabledRef.current) return;

    pendingRef.current = true;
    schedulerRef.current?.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, projectId]);

  // visibilitychange is the primary leave-the-page signal — fires reliably
  // on tab switch, minimize, and mobile backgrounding, and fires before most
  // browsers' unload sequence. beforeunload is a best-effort backup only; a
  // multi-request authenticated save can't be guaranteed to complete once
  // the page is actually torn down.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") schedulerRef.current?.flushNow();
    };
    const onBeforeUnload = () => { schedulerRef.current?.flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return status;
}
