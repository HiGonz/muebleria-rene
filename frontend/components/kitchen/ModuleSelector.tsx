"use client";

import { useState } from "react";
import { MODULE_CATALOG, CATEGORY_LABELS, CATEGORY_ICONS, getModulesByCategory } from "@/services/kitchenData";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Button } from "@/components/ui/button";
import type { ModuleCategory } from "@/types/kitchen";

const CATEGORIES: ModuleCategory[] = ["lower", "upper", "tower", "countertop", "appliance", "accessory"];

export function ModuleSelector() {
  const { addModule, closeSelector, selectorCategory, setSelectorCategory } = useKitchenStore();
  const [search, setSearch] = useState("");

  const category = selectorCategory;
  const modules = category ? getModulesByCategory(category) : MODULE_CATALOG;
  const filtered = search.trim()
    ? modules.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase()))
    : modules;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
        <h2 className="text-base font-semibold text-white">Agregar módulo</h2>
        <button onClick={closeSelector} className="text-zinc-500 hover:text-white transition-colors text-xl leading-none">&times;</button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar módulo..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-hide">
        <button
          onClick={() => setSelectorCategory(null)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${!category ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white hover:bg-white/8"}`}
        >
          Todos
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectorCategory(cat)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${category === cat ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white hover:bg-white/8"}`}
          >
            {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Module grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!search && !category && (
          // Grouped by category
          <div className="space-y-5 pt-2">
            {CATEGORIES.map((cat) => {
              const catModules = getModulesByCategory(cat);
              return (
                <div key={cat}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{CATEGORY_LABELS[cat]}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {catModules.map((entry) => (
                      <ModuleChip key={entry.type} entry={entry} onAdd={() => addModule(entry.type)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(search || category) && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {filtered.length === 0 && (
              <p className="col-span-2 py-8 text-center text-sm text-zinc-500">No se encontraron módulos</p>
            )}
            {filtered.map((entry) => (
              <ModuleChip key={entry.type} entry={entry} onAdd={() => addModule(entry.type)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleChip({ entry, onAdd }: { entry: typeof MODULE_CATALOG[number]; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="group flex flex-col gap-1.5 rounded-xl border border-white/8 bg-white/4 p-3 text-left transition-all hover:border-indigo-500/50 hover:bg-indigo-500/8 active:scale-[0.97]"
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{entry.icon}</span>
        <span className="text-xs font-semibold text-white leading-tight">{entry.label}</span>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">{entry.description}</p>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-600">
        <span className="rounded bg-white/6 px-1.5 py-0.5">{entry.defaultDimensions.width}×{entry.defaultDimensions.height}×{entry.defaultDimensions.depth} cm</span>
      </div>
    </button>
  );
}
