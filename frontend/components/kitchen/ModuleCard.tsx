"use client";

import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/services/kitchenData";
import { useKitchenStore } from "@/store/useKitchenStore";
import type { KitchenModule } from "@/types/kitchen";

interface Props {
  module: KitchenModule;
  isEditing: boolean;
}

export function ModuleCard({ module, isEditing }: Props) {
  const { setEditingModule, removeModule, duplicateModule, rotateModule } = useKitchenStore();

  return (
    <div
      className={`group relative rounded-xl border transition-all ${isEditing ? "border-indigo-500/70 bg-indigo-500/8" : "border-white/8 bg-white/4 hover:border-white/15"}`}
    >
      {/* Color accent strip */}
      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: module.options.color || "#6366f1" }} />

      <div className="pl-4 pr-3 py-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-base">{CATEGORY_ICONS[module.category]}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white leading-tight">{module.label}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {CATEGORY_LABELS[module.category]}
              </p>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => rotateModule(module.id)}
              title="Rotar 90°"
              className="rounded-lg p-1 text-zinc-600 hover:text-zinc-300 hover:bg-white/8 transition-colors"
            >
              ⟳
            </button>
            <button
              onClick={() => duplicateModule(module.id)}
              title="Duplicar"
              className="rounded-lg p-1 text-zinc-600 hover:text-zinc-300 hover:bg-white/8 transition-colors"
            >
              ⧉
            </button>
            <button
              onClick={() => removeModule(module.id)}
              title="Eliminar"
              className="rounded-lg p-1 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Dimensions pill */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
            📐 {module.dimensions.width} × {module.dimensions.height} × {module.dimensions.depth} cm
          </span>
          {module.options.boardMaterial && (
            <span className="inline-flex items-center rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 truncate max-w-30">
              {module.options.boardMaterial}
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
            ⟳ {module.rotation}°
          </span>
        </div>

        {/* Spec chips */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {module.options.doors > 0 && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{module.options.doors} puertas</span>
          )}
          {module.options.drawers > 0 && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{module.options.drawers} cajones</span>
          )}
          {module.options.shelves > 0 && (
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{module.options.shelves} repisas</span>
          )}
          {module.options.includesCountertop && module.category === "lower" && (
            <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-400">{module.options.countertopMaterial}</span>
          )}
        </div>

        {/* Edit button */}
        <button
          onClick={() => setEditingModule(isEditing ? null : module.id)}
          className={`mt-2.5 w-full rounded-lg border py-1.5 text-xs font-medium transition-colors ${
            isEditing
              ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
              : "border-white/8 bg-transparent text-zinc-400 hover:border-indigo-500/40 hover:text-indigo-300"
          }`}
        >
          {isEditing ? "✓ Editando" : "✎ Personalizar"}
        </button>
      </div>
    </div>
  );
}
