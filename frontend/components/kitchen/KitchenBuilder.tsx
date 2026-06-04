"use client";

import dynamic from "next/dynamic";
import { useKitchenStore } from "@/store/useKitchenStore";
import { ModuleList } from "./ModuleList";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleEditor } from "./ModuleEditor";
import { KitchenProjectForm } from "./KitchenProjectForm";
import { KitchenSummary } from "./KitchenSummary";
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

export function KitchenBuilder() {
  const { draft, activeTab, showSelector, setActiveTab, resetDraft } = useKitchenStore();
  const router = useRouter();

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
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Project config (hidden on mobile unless toggled) */}
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
              ) : draft.editingModuleId ? (
                <ModuleEditor />
              ) : (
                <EmptyState />
              )}
            </div>
          </div>
        )}

        {/* ── 3D TAB ──────────────────────────────────────────────────── */}
        {activeTab === "3d" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {modulesCount === 0 ? (
              <div className="flex flex-1 items-center justify-center flex-col gap-4 text-center">
                <div className="text-6xl opacity-30">🏗️</div>
                <p className="text-sm text-zinc-500">Agrega módulos para ver la cocina en 3D</p>
                <Button variant="primary" onClick={() => { setActiveTab("builder"); }}>Ir al constructor</Button>
              </div>
            ) : (
              <KitchenAssemblyScene modules={draft.modules} ceilingHeight={draft.ceilingHeight} />
            )}
          </div>
        )}

        {/* ── SUMMARY TAB ─────────────────────────────────────────────── */}
        {activeTab === "summary" && (
          <div className="flex-1 overflow-y-auto">
            <KitchenSummary />
          </div>
        )}
      </div>
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
