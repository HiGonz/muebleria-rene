"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, Sparkles, Palette, Ruler, ChevronDown, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { SampleKitchenVariant } from "@/services/kitchenData";
import { getKitchenProject, saveKitchenProject } from "@/services/api";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
import { GlobalMaterialsModal } from "./GlobalMaterialsModal";
import { GlobalHeightsModal } from "./GlobalHeightsModal";
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

const SAMPLE_KITCHENS: { variant: SampleKitchenVariant; label: string; hint: string }[] = [
  { variant: 1, label: "Cocina 1", hint: "Normal · doble alacena aérea" },
  { variant: 2, label: "Cocina 2", hint: "Isla · cocina de puente" },
  { variant: 3, label: "Cocina 3", hint: "Corona de luz" },
];

export function KitchenBuilder() {
  const {
    draft, projectId, activeTab, showSelector, setActiveTab, resetDraft, loadSampleKitchen, loadProject, updateModulePosition, nudgeModule,
    openSelector, setEditingModule, moveHistory, undoLastMove, updateOpening, removeModule, toggleModuleLock,
  } = useKitchenStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showGlobalMaterials, setShowGlobalMaterials] = useState(false);
  const [showGlobalHeights, setShowGlobalHeights] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSampleMenu, setShowSampleMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const sampleMenuRef = useRef<HTMLDivElement>(null);

  // Loading /kitchen?projectId=123 pulls that saved project from the backend
  // into the draft — only once per id, so it doesn't clobber edits in progress.
  const loadedProjectIdRef = useRef<number | null>(null);
  useEffect(() => {
    const param = searchParams.get("projectId");
    const id = param ? Number(param) : null;
    if (id === null || Number.isNaN(id) || loadedProjectIdRef.current === id) return;
    loadedProjectIdRef.current = id;
    getKitchenProject(id)
      .then((remoteDraft) => loadProject(id, remoteDraft))
      .catch(() => toast.error("No fue posible cargar el proyecto de cocina."));
  }, [searchParams, loadProject]);

  useEffect(() => {
    if (!showSampleMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(e.target as Node)) setShowSampleMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showSampleMenu]);
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

  return (
    <div className="flex h-screen flex-col bg-ink text-ivory overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ivory/8 px-5 py-3">
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
          <Button
            variant="ghost"
            className="h-8 w-8 px-0 text-xs sm:w-auto sm:px-3"
            onClick={() => setShowGlobalHeights(true)}
            title="Alturas globales"
            aria-label="Alturas globales"
          >
            <Ruler size={14} />
            <span className="hidden sm:inline sm:ml-1.5">Alturas</span>
          </Button>
          <div className="relative" ref={sampleMenuRef}>
            <Button
              variant="ghost"
              className="h-8 w-8 px-0 text-xs sm:w-auto sm:px-3"
              onClick={() => setShowSampleMenu((v) => !v)}
              title="Cocina de muestra"
              aria-label="Cocina de muestra"
              aria-haspopup="menu"
              aria-expanded={showSampleMenu}
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline sm:ml-1.5">Cocina de muestra</span>
              <ChevronDown size={12} className="hidden sm:inline sm:ml-1" />
            </Button>
            {showSampleMenu && (
              <div
                role="menu"
                aria-label="Elegir cocina de muestra"
                className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-ivory/12 bg-ink/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md"
              >
                {SAMPLE_KITCHENS.map((k) => (
                  <button
                    key={k.variant}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      loadSampleKitchen(k.variant);
                      setShowSampleMenu(false);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ivory/8"
                  >
                    <span className="text-xs font-medium text-ivory">{k.label}</span>
                    <span className="text-[10px] text-warmgray">{k.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
          <Button
            variant="primary"
            className="h-8 px-3 text-xs"
            disabled={saving}
            onClick={async () => {
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
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </header>

      {/* ── Mobile tabs ─────────────────────────────────────────────────────── */}
      <div className="flex sm:hidden border-b border-ivory/8 bg-ivory/3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activeTab === tab.id ? "text-brass-soft border-b-2 border-brass" : "text-warmgray"}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

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
              onModuleMove={(id, x, z, rotation) => updateModulePosition(id, x, z, rotation)}
              onModuleActivate={(id) => setEditingModule(id)}
              onModuleNudge={(id, dx, dz, dMountHeight) => nudgeModule(id, dx, dz, dMountHeight)}
              onModuleRemove={removeModule}
              onModuleToggleLock={toggleModuleLock}
              onOpeningMove={(id, offset) => updateOpening(id, { offset })}
              onUndo={undoLastMove}
              undoCount={moveHistory.length}
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
      {showGlobalHeights && <GlobalHeightsModal onClose={() => setShowGlobalHeights(false)} />}
      {showShareModal && projectId !== null && (
        <ShareModal kitchenProjectId={projectId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}
