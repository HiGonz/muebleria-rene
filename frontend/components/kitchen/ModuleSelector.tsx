"use client";

import { useState } from "react";
import { MODULE_CATALOG, CATEGORY_LABELS, CATEGORY_ICONS, getModulesByCategory } from "@/services/kitchenData";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useCatalogThumbnails } from "./CatalogThumbnails";
import type { ModuleCategory } from "@/types/kitchen";

const CATEGORIES: ModuleCategory[] = ["lower", "upper", "tower", "corner", "countertop", "appliance", "accessory"];

export function ModuleSelector() {
  const { addModule, closeSelector, selectorCategory, setSelectorCategory } = useKitchenStore();
  const [search, setSearch] = useState("");
  const { thumbs } = useCatalogThumbnails();

  const category = selectorCategory;
  const modules = category ? getModulesByCategory(category) : MODULE_CATALOG;
  const filtered = search.trim()
    ? modules.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase()))
    : modules;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-ivory/8">
        <h2 className="font-display text-base font-semibold text-ivory">Agregar módulo</h2>
        <button onClick={closeSelector} className="text-warmgray hover:text-ivory transition-colors text-xl leading-none">&times;</button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar módulo..."
          className="w-full rounded-xl border border-ivory/10 bg-ivory/5 px-3 py-2 text-sm text-ivory placeholder:text-warmgray/60 focus:border-brass/60 focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-hide">
        <button
          onClick={() => setSelectorCategory(null)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${!category ? "bg-brass text-ink" : "text-warmgray hover:text-ivory hover:bg-ivory/8"}`}
        >
          Todos
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectorCategory(cat)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${category === cat ? "bg-brass text-ink" : "text-warmgray hover:text-ivory hover:bg-ivory/8"}`}
          >
            {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Module list — real 3D previews, one per row */}
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
                    <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">{CATEGORY_LABELS[cat]}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {catModules.map((entry) => (
                      <ModuleChip key={entry.type} entry={entry} thumb={thumbs[entry.type]} onAdd={() => addModule(entry.type)} />
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
              <p className="col-span-2 py-8 text-center text-sm text-warmgray">No se encontraron módulos</p>
            )}
            {filtered.map((entry) => (
              <ModuleChip key={entry.type} entry={entry} thumb={thumbs[entry.type]} onAdd={() => addModule(entry.type)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleChip({ entry, thumb, onAdd }: { entry: typeof MODULE_CATALOG[number]; thumb?: string; onAdd: () => void }) {
  // Falls back to the catalog's own emoji icon if the static thumbnail is
  // missing (a 404, not a loading state — these are pre-rendered files, see
  // CatalogThumbnails.tsx) — most likely a module type added to the catalog
  // after the last thumbnail-export pass. Re-run that export to add it;
  // there's no live-render fallback anymore (see that file for why).
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <button
      onClick={onAdd}
      className="group flex flex-col overflow-hidden rounded-xl border border-ivory/8 bg-ivory/4 text-left transition-all hover:border-brass/50 hover:bg-brass/8 active:scale-[0.97]"
    >
      <div className="flex h-24 w-full items-center justify-center overflow-hidden bg-ink">
        {thumb && !thumbFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- static file under public/, not optimizable at build time
          <img src={thumb} alt={entry.label} className="h-full w-full object-contain" onError={() => setThumbFailed(true)} />
        ) : (
          <span className="text-2xl opacity-40">{entry.icon}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm shrink-0">{entry.icon}</span>
          <span className="text-xs font-semibold text-ivory leading-tight">{entry.label}</span>
        </div>
        <p className="text-[10px] text-warmgray leading-relaxed line-clamp-2">{entry.description}</p>
        <span className="w-fit rounded bg-ivory/6 px-1.5 py-0.5 text-[10px] text-warmgray/70">
          {entry.defaultDimensions.width}×{entry.defaultDimensions.height}×{entry.defaultDimensions.depth} cm
        </span>
      </div>
    </button>
  );
}
