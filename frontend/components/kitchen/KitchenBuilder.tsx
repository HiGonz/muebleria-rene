"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, Palette, Share2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { getKitchenProject, saveKitchenProject } from "@/services/api";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
import { GlobalMaterialsModal } from "./GlobalMaterialsModal";
import { RoomSettingsModal } from "./RoomSettingsModal";
import { ShareModal } from "./ShareModal";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

const KitchenAssemblyScene = dynamic(() => import("@/components/3d/KitchenAssemblyScene").then((m) => m.KitchenAssemblyScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
    </div>
  ),
});

const TABS = [
  { id: "3d" as const,      label: "Vista 3D", icon: "🏗️" },
  { id: "summary" as const, label: "Resumen",  icon: "📋" },
];

export function KitchenBuilder() {
  const {
    draft, projectId, activeTab, showSelector, setActiveTab, resetDraft, loadProject, updateModulePosition, nudgeModule,
    openSelector, setEditingModule, undoStack, redoStack, undo, redo, updateOpening, removeModule, toggleModuleLock,
  } = useKitchenStore();
  const handleOpeningMove = useCallback((id: string, offset: number) => updateOpening(id, { offset }), [updateOpening]);
  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — global within the builder (not scoped
  // to the 3D tab) since editing also happens through the module inspector.
  // Ignored with focus in a text field, same guard the arrow-key nudge in
  // KitchenAssemblyScene.tsx already uses.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      if (key === "y" || (key === "z" && e.shiftKey)) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showGlobalMaterials, setShowGlobalMaterials] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [saving, setSaving] = useState(false);
  // Everything the full desktop header shows inline (project name/client,
  // Nuevo, Compartir, Habitación, Materiales, Guardar) collapses into this
  // one menu below 768px — see the compact mobile header further down.
  // Desktop (md:) is untouched.
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Loading /kitchen?projectId=123 pulls that saved project from the backend
  // into the draft — only once per id, so it doesn't clobber edits in progress.
  const loadedProjectIdRef = useRef<number | null>(null);
  // Gates rendering while the target project's data hasn't arrived yet —
  // without this, navigating straight from one saved project to another
  // re-mounts this component with the OUTGOING project's draft still sitting
  // in the (page-level) store, and it flashes on screen for the second or
  // two the fetch below takes before loadProject() swaps it out. Lazily
  // initialized so a fresh mount whose URL already wants a different
  // project than what's currently in the store starts in the loading state
  // from the very first paint, instead of flashing the stale draft first.
  const [projectLoading, setProjectLoading] = useState(() => {
    const param = searchParams.get("projectId");
    const id = param ? Number(param) : null;
    return id !== null && !Number.isNaN(id) && id !== projectId;
  });
  useEffect(() => {
    const param = searchParams.get("projectId");
    const id = param ? Number(param) : null;
    if (id === null || Number.isNaN(id) || loadedProjectIdRef.current === id) return;
    loadedProjectIdRef.current = id;
    setProjectLoading(true);
    getKitchenProject(id)
      .then((remoteDraft) => loadProject(id, remoteDraft))
      .catch(() => toast.error("No fue posible cargar el proyecto de cocina."))
      .finally(() => setProjectLoading(false));
  }, [searchParams, loadProject]);

  useEffect(() => {
    if (!showMobileMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setShowMobileMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showMobileMenu]);
  // draft.editingModuleId is persisted, so it can point at a module that no
  // longer exists (deleted in another session, stale localStorage, etc). Treat
  // that the same as "not editing" everywhere, instead of trusting the raw id
  // — otherwise the mobile view gets stuck showing ModuleEditor's empty state
  // with no way back to the list.
  const editingModule = draft.modules.find((m) => m.id === draft.editingModuleId);
  useEffect(() => {
    if (draft.editingModuleId && !editingModule) setEditingModule(null);
  }, [draft.editingModuleId, editingModule, setEditingModule]);

  // The "builder" tab no longer exists (folded into the "Habitación" modal,
  // reachable from any tab) — a session with it persisted from before would
  // otherwise land on a blank content area.
  useEffect(() => {
    if (activeTab === "builder") setActiveTab("3d");
  }, [activeTab, setActiveTab]);

  const modulesCount = draft.modules.length;

  // Shared by the desktop header's own Guardar button and the mobile
  // overflow menu's — same action, same request in flight either way.
  const handleSave = async () => {
    setSaving(true);
    try {
      const savedId = await saveKitchenProject(draft, projectId);
      if (projectId === null) loadProject(savedId, draft);
      toast.success("Cocina guardada.", {
        action: { label: "Ver proyectos", onClick: () => router.push("/kitchen/projects") },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar la cocina.");
    } finally {
      setSaving(false);
    }
  };

  if (projectLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      {/* ── Top Bar (desktop, ≥768px) ───────────────────────────────────────── */}
      <header className="hidden md:flex shrink-0 items-center justify-between gap-4 border-b border-ivory/8 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Goes straight to the saved-projects list rather than
              router.back() — the builder has no sidebar of its own (it's
              full-screen), so this is the only way in/out of it to actually
              find a project you already saved. */}
          <button onClick={() => router.push("/kitchen/projects")} title="Ver proyectos de cocina guardados" className="text-warmgray hover:text-ivory transition-colors">
            ←
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold text-ivory">{draft.projectName || "Nueva cocina"}</h1>
            <p className="text-xs text-warmgray">{draft.clientName || "Sin cliente"} · {modulesCount} módulo{modulesCount !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Tabs */}
        <nav className="hidden sm:flex items-center gap-1 rounded-xl border border-ivory/8 bg-ivory/4 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id ? "bg-brass text-ink shadow" : "text-warmgray hover:text-ivory"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="h-8 w-8 px-0 text-xs sm:w-auto sm:px-3"
            onClick={() => setShowRoomSettings(true)}
            title="Habitación"
            aria-label="Habitación"
          >
            <Settings size={14} />
            <span className="hidden sm:inline sm:ml-1.5">Habitación</span>
          </Button>
          <Button
            variant="ghost"
            className="h-8 w-8 px-0 text-xs sm:w-auto sm:px-3"
            onClick={() => setShowGlobalMaterials(true)}
            title="Materiales globales"
            aria-label="Materiales globales"
          >
            <Palette size={14} />
            <span className="hidden sm:inline sm:ml-1.5">Materiales</span>
          </Button>
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={resetDraft}>Nuevo</Button>
          {projectId !== null && (
            <Button
              variant="ghost"
              className="h-8 w-8 px-0 text-xs sm:w-auto sm:px-3"
              onClick={() => setShowShareModal(true)}
              title="Compartir con cliente"
              aria-label="Compartir con cliente"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline sm:ml-1.5">Compartir</span>
            </Button>
          )}
          <Button variant="primary" className="h-8 px-3 text-xs" disabled={saving} onClick={handleSave}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </header>

      {/* ── Top bar (mobile, <768px) ─────────────────────────────────────────
          One slim row replaces the desktop header + the old separate tab
          strip below it — project name/client and every secondary action
          (Nuevo, Compartir, Habitación, Materiales, Guardar) move into the
          "⋮" menu so the 3D view and the module panel get as much vertical
          space as possible. */}
      <header className="flex md:hidden shrink-0 items-center gap-1.5 border-b border-ivory/8 px-2 h-11">
        <button
          onClick={() => router.push("/kitchen/projects")}
          title="Ver proyectos de cocina guardados"
          aria-label="Ver proyectos de cocina guardados"
          className="shrink-0 rounded-lg p-1.5 text-warmgray hover:text-ivory transition-colors"
        >
          ←
        </button>
        <nav className="flex flex-1 min-w-0 items-center gap-0.5 rounded-lg border border-ivory/8 bg-ivory/4 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 truncate rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                activeTab === tab.id ? "bg-brass text-ink" : "text-warmgray"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
        <div className="relative shrink-0" ref={mobileMenuRef}>
          <button
            onClick={() => setShowMobileMenu((v) => !v)}
            title="Más opciones"
            aria-label="Más opciones"
            aria-haspopup="menu"
            aria-expanded={showMobileMenu}
            className="rounded-lg p-1.5 text-warmgray hover:text-ivory transition-colors"
          >
            <MoreVertical size={18} />
          </button>
          {showMobileMenu && (
            <div
              role="menu"
              aria-label="Más opciones"
              className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-ivory/12 bg-ink/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md"
            >
              <div className="border-b border-ivory/8 px-3 py-2">
                <p className="truncate text-xs font-semibold text-ivory">{draft.projectName || "Nueva cocina"}</p>
                <p className="truncate text-[10px] text-warmgray">{draft.clientName || "Sin cliente"} · {modulesCount} módulo{modulesCount !== 1 ? "s" : ""}</p>
              </div>
              <button role="menuitem" onClick={() => { resetDraft(); setShowMobileMenu(false); }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ivory transition-colors hover:bg-ivory/8">
                Nuevo
              </button>
              {projectId !== null && (
                <button role="menuitem" onClick={() => { setShowShareModal(true); setShowMobileMenu(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ivory transition-colors hover:bg-ivory/8">
                  <Share2 size={14} className="text-warmgray" /> Compartir
                </button>
              )}
              <button role="menuitem" onClick={() => { setShowRoomSettings(true); setShowMobileMenu(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ivory transition-colors hover:bg-ivory/8">
                <Settings size={14} className="text-warmgray" /> Habitación
              </button>
              <button role="menuitem" onClick={() => { setShowGlobalMaterials(true); setShowMobileMenu(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ivory transition-colors hover:bg-ivory/8">
                <Palette size={14} className="text-warmgray" /> Materiales globales
              </button>
              <div className="mt-1 border-t border-ivory/8 pt-1">
                <button
                  role="menuitem"
                  disabled={saving}
                  onClick={() => { handleSave(); setShowMobileMenu(false); }}
                  className="flex w-full items-center justify-center rounded-lg bg-brass px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-brass-soft disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 3D TAB ──────────────────────────────────────────────────── */}
        {activeTab === "3d" && (
          <div className="relative flex flex-1 flex-col overflow-hidden">
            <KitchenAssemblyScene
              modules={draft.modules}
              roomWidth={draft.roomWidth}
              roomDepth={draft.roomDepth}
              ceilingHeight={draft.ceilingHeight}
              openings={draft.openings}
              onModuleMove={updateModulePosition}
              onModuleActivate={setEditingModule}
              onModuleNudge={nudgeModule}
              onModuleRemove={removeModule}
              onModuleToggleLock={toggleModuleLock}
              onOpeningMove={handleOpeningMove}
              onUndo={undo}
              undoCount={undoStack.length}
              onRedo={redo}
              redoCount={redoStack.length}
              cameraPersistKey={projectId}
            />

            {modulesCount === 0 && !showSelector && !editingModule && (
              <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex justify-center">
                <p className="rounded-full border border-ivory/10 bg-ink/70 px-4 py-2 text-xs text-ivory/70 backdrop-blur-sm">
                  Habitación vacía · usa el botón + para agregar tu primer mueble
                </p>
              </div>
            )}

            {!showSelector && !editingModule && (
              <BuilderFab onClick={() => openSelector()} className="bottom-6 left-1/2 -translate-x-1/2" />
            )}

            <AnimatePresence>
              {showSelector ? (
                <motion.div
                  key="selector"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink sm:w-96"
                >
                  <ModuleSelector />
                </motion.div>
              ) : editingModule ? (
                <motion.div
                  key="inspector"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink sm:w-96"
                >
                  <ModuleInspector />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}

        {/* ── SUMMARY TAB ─────────────────────────────────────────────── */}
        {activeTab === "summary" && (
          <div className="flex-1 overflow-y-auto">
            <KitchenSummary />
          </div>
        )}
      </div>

      {showRoomSettings && <RoomSettingsModal onClose={() => setShowRoomSettings(false)} />}
      {showGlobalMaterials && <GlobalMaterialsModal onClose={() => setShowGlobalMaterials(false)} />}
      {showShareModal && projectId !== null && (
        <ShareModal kitchenProjectId={projectId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}
