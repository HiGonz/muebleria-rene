"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useKitchenStore } from "@/store/useKitchenStore";
import { ModuleForm } from "./ModuleForm";
import { FaceEditor } from "./FaceEditor";
import type { KitchenModule } from "@/types/kitchen";

const ModulePreview3D = dynamic(
  () => import("@/components/3d/ModulePreview3D").then((m) => ({ default: m.ModulePreview3D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-55 w-full items-center justify-center rounded-xl border border-white/8 bg-[#080810]">
        <span className="text-xs text-zinc-600">Cargando vista 3D…</span>
      </div>
    ),
  }
);

type EditorTab = "layout" | "options";

export function ModuleEditor() {
  const { getEditingModule, updateModule, setEditingModule } = useKitchenStore();
  const [activeTab, setActiveTab] = useState<EditorTab>("layout");
  const module = getEditingModule();

  if (!module) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 px-6 text-center">
        <div className="text-5xl opacity-30">✎</div>
        <p className="text-sm text-zinc-400">Selecciona un módulo de la lista para personalizarlo</p>
      </div>
    );
  }

  const handleChange = (patch: Partial<KitchenModule>) => {
    updateModule(module.id, patch);
  };

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: module.options.color }} />
          <p className="truncate text-sm font-semibold text-white">{module.label}</p>
          <span className="shrink-0 rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-zinc-500">
            {module.dimensions.width}×{module.dimensions.height}×{module.dimensions.depth} cm
          </span>
        </div>
        <button
          onClick={() => setEditingModule(null)}
          className="shrink-0 text-xl leading-none text-zinc-500 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>

      {/* ─── 3D Preview ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4">
        <ModulePreview3D module={module} />
        <p className="mt-1 text-center text-[10px] text-zinc-600">
          Vista en tiempo real · Arrastra para rotar
        </p>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="mt-3 flex shrink-0 border-b border-white/8 px-4">
        {(
          [
            { id: "layout" as const, label: "Distribución" },
            { id: "options" as const, label: "Opciones" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`mr-1 rounded-t-lg px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border border-b-0 border-white/10 bg-white/6 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "layout" ? (
          <FaceEditor module={module} onChange={handleChange} />
        ) : (
          <ModuleForm module={module} onChange={handleChange} />
        )}
      </div>
    </div>
  );
}

