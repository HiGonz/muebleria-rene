"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, Sparkles, Palette } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { ModuleList } from "./ModuleList";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleEditor } from "./ModuleEditor";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenProjectForm } from "./KitchenProjectForm";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
import { GlobalMaterialsModal } from "./GlobalMaterialsModal";
import { useIsCatalogGenerating } from "./CatalogThumbnails";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const KitchenAssemblyScene = dynamic(() => import("@/components/3d/KitchenAssemblyScene").then((m) => m.KitchenAssemblyScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
});

const TABS = [
  { id: "builder" as const, label: "Constructor", icon: "🔧" },
  { id: "3d" as const,      label: "Vista 3D",   icon: "🏗️" },
  { id: "summary" as const, label: "Resumen",    icon: "📋" },
];

const slideProps = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

export function KitchenBuilder() {
  const {
    draft, activeTab, showSelector, setActiveTab, resetDraft, loadSampleKitchen, updateModulePosition,
    openSelector, setEditingModule, moveHistory, undoLastMove,
  } = useKitchenStore();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [showProjectSheet, setShowProjectSheet] = useState(false);
  const [showGlobalMaterials, setShowGlobalMaterials] = useState(false);
  // The furniture selector's off-screen thumbnail rig needs its own WebGL
  // context — running it at the same time as the live assembly scene can
  // crash the scene's context, so the scene stands down for the few seconds
  // that takes (only happens once per session, the first time it's opened).
  const catalogGenerating = useIsCatalogGenerating();

  // draft.editingModuleId is persisted, so it can point at a module that no
  // longer exists (deleted in another session, stale localStorage, etc). Treat
  // that the same as "not editing" everywhere, instead of trusting the raw id
  // — otherwise the mobile view gets stuck showing ModuleEditor's empty state
  // with no way back to the list.
  const editingModule = draft.modules.find((m) => m.id === draft.editingModuleId);
  useEffect(() => {
    if (draft.editingModuleId && !editingModule) setEditingModule(null);
  }, [draft.editingModuleId, editingModule, setEditingModule]);

  const modulesCount = draft.modules.length;

  return (
    <div className="flex h-screen flex-col bg-[#0a0a10] text-white overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} className="text-zinc-500 hover:text-white transition-colors">
            ← 
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-white">{draft.projectName || "Nueva cocina"}</h1>
            <p className="text-xs text-zinc-500">{draft.clientName || "Sin cliente"} · {modulesCount} módulo{modulesCount !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Tabs */}
        <nav className="hidden sm:flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id ? "bg-indigo-500 text-white shadow" : "text-zinc-400 hover:text-white"
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
            onClick={loadSampleKitchen}
            title="Cocina de muestra"
            aria-label="Cocina de muestra"
          >
            <Sparkles size={14} />
            <span className="hidden sm:inline sm:ml-1.5">Cocina de muestra</span>
          </Button>
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={resetDraft}>Nuevo</Button>
          <Button variant="primary" className="h-8 px-3 text-xs" onClick={() => alert("Guardado (demo)")}>
            Guardar
          </Button>
        </div>
      </header>

      {/* ── Mobile tabs ─────────────────────────────────────────────────────── */}
      <div className="flex sm:hidden border-b border-white/8 bg-white/3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activeTab === tab.id ? "text-indigo-300 border-b-2 border-indigo-500" : "text-zinc-500"}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── BUILDER TAB ─────────────────────────────────────────────── */}
        {activeTab === "builder" && (
          isMobile ? (
            <div className="relative flex flex-1 flex-col overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {showSelector ? (
                  <motion.div key="selector" {...slideProps} className="absolute inset-0 flex flex-col bg-[#0a0a10]">
                    <ModuleSelector />
                  </motion.div>
                ) : editingModule ? (
                  <motion.div key="editor" {...slideProps} className="absolute inset-0 flex flex-col overflow-hidden bg-[#0d0d14]">
                    <ModuleEditor />
                  </motion.div>
                ) : (
                  <motion.div key="list" {...slideProps} className="absolute inset-0 flex flex-col">
                    <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Módulos</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-400">{modulesCount}</span>
                        <button
                          onClick={() => setShowProjectSheet(true)}
                          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                          aria-label="Datos del proyecto"
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ModuleList />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!showSelector && !editingModule && <BuilderFab onClick={() => openSelector()} />}

              {/* Project data — full-screen sheet on mobile (desktop keeps it as a static side panel) */}
              <AnimatePresence>
                {showProjectSheet && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40 bg-black/60"
                    onClick={() => setShowProjectSheet(false)}
                  >
                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      transition={{ type: "spring", damping: 28, stiffness: 300 }}
                      className="safe-bottom absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0d0d14] p-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Datos del proyecto</p>
                        <button onClick={() => setShowProjectSheet(false)} className="text-xl leading-none text-zinc-500 hover:text-white">&times;</button>
                      </div>
                      <KitchenProjectForm />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Project config */}
              <aside className="hidden xl:flex w-72 shrink-0 flex-col border-r border-white/8 overflow-y-auto">
                <div className="border-b border-white/8 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Datos del proyecto</p>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <KitchenProjectForm />
                </div>
              </aside>

              {/* Center: Module list */}
              <div className="flex w-64 shrink-0 flex-col border-r border-white/8 lg:w-72">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Módulos</p>
                  <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-zinc-400">{modulesCount}</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ModuleList />
                </div>
              </div>

              {/* Right panel: Selector or Editor */}
              <div className="flex flex-1 flex-col overflow-hidden bg-[#0d0d14]">
                {showSelector ? (
                  <ModuleSelector />
                ) : editingModule ? (
                  <ModuleEditor />
                ) : (
                  <EmptyState />
                )}
              </div>
            </div>
          )
        )}

        {/* ── 3D TAB ──────────────────────────────────────────────────── */}
        {activeTab === "3d" && (
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {catalogGenerating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#0d0d14] text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <p className="text-xs text-zinc-500">Preparando vista 3D…</p>
              </div>
            ) : (
              <KitchenAssemblyScene
                modules={draft.modules}
                roomWidth={draft.roomWidth}
                roomDepth={draft.roomDepth}
                ceilingHeight={draft.ceilingHeight}
                openings={draft.openings}
                onModuleMove={(id, x, z) => updateModulePosition(id, x, z)}
                onModuleActivate={(id) => setEditingModule(id)}
                onUndo={undoLastMove}
                undoCount={moveHistory.length}
              />
            )}

            {modulesCount === 0 && !showSelector && !editingModule && !catalogGenerating && (
              <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex justify-center">
                <p className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs text-zinc-300 backdrop-blur-sm">
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
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-white/8 bg-[#0a0a10] sm:w-96"
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
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-white/8 bg-[#0a0a10] sm:w-96"
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

      {showGlobalMaterials && <GlobalMaterialsModal onClose={() => setShowGlobalMaterials(false)} />}
    </div>
  );
}

function EmptyState() {
  const { openSelector } = useKitchenStore();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="grid grid-cols-3 gap-3 opacity-30">
        {["🗄️", "📦", "🏗️", "🟫", "⚡", "🔩"].map((icon, i) => (
          <div key={i} className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/4 text-2xl">
            {icon}
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-base font-semibold text-white">Diseña tu cocina módulo a módulo</h3>
        <p className="mt-1 max-w-xs text-sm text-zinc-500">
          Selecciona un módulo de la lista para personalizarlo, o agrega uno nuevo.
        </p>
      </div>
      <Button variant="primary" onClick={() => openSelector()}>
        + Agregar primer módulo
      </Button>
    </div>
  );
}
