"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { MODULE_CATALOG } from "@/services/kitchenData";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useCatalogThumbnails } from "./CatalogThumbnails";
import type { KitchenModuleType, ModuleCatalogEntry } from "@/types/kitchen";

// Purely a navigation grouping for this panel's landing screen — distinct
// from ModuleCategory (the data model stored on every module, used by the
// store/backend/3D renderer). Keeping it local means we can reshuffle how
// modules are browsed without touching anything that depends on the real
// category. "Mesas y sillas" has no catalog entries yet (no table/chair
// module types exist) — it's a placeholder group until those are added.
//
// Matching by ModuleCategory alone isn't precise enough for two groups:
// the catalog's "appliance" category is actually built-in niches/cutouts
// (nicho_refrigerador, espacio_lavavajillas, etc.), while the free-standing
// appliances themselves (tarja, estufa, refrigerador...) are tagged
// "accessory" alongside unrelated hardware/panels/organizers. So
// "Electrodoméstico" and "Otros" list their member types explicitly to
// split that category correctly instead of taking it whole.
const APPLIANCE_ITEM_TYPES: KitchenModuleType[] = [
  "tarja", "parrilla", "estufa", "refrigerador", "microondas", "lavavajillas", "campana_extractora",
];
const OTHER_ACCESSORY_TYPES: KitchenModuleType[] = [
  "herrajes", "panel_lateral", "panel_remate", "panel_decorativo", "organizador_especias", "cubertero", "especiero_aluminio",
];

interface SelectorGroup {
  id: string;
  label: string;
  icon: string;
  match: (entry: ModuleCatalogEntry) => boolean;
}

const SELECTOR_GROUPS: SelectorGroup[] = [
  { id: "armario_bajo", label: "Armario Bajo", icon: "🗄️", match: (e) => e.category === "lower" },
  { id: "armario_pared", label: "Armario de pared", icon: "📦", match: (e) => e.category === "upper" },
  { id: "armario_esquina", label: "Armario de Esquina", icon: "📐", match: (e) => e.category === "corner" },
  { id: "armarios_altos", label: "Armarios altos", icon: "🏗️", match: (e) => e.category === "tower" },
  { id: "electrodomestico", label: "Electrodoméstico", icon: "⚡", match: (e) => e.category === "appliance" || APPLIANCE_ITEM_TYPES.includes(e.type) },
  { id: "mesas_sillas", label: "Mesas y sillas", icon: "🍽️", match: () => false },
  { id: "otros", label: "Otros", icon: "🔩", match: (e) => e.category === "countertop" || OTHER_ACCESSORY_TYPES.includes(e.type) },
];

export function ModuleSelector() {
  const { addModule, closeSelector } = useKitchenStore();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<SelectorGroup | null>(null);
  const { thumbs } = useCatalogThumbnails();

  const searching = search.trim().length > 0;
  const showLanding = !searching && !group;
  const scopedModules = group ? MODULE_CATALOG.filter(group.match) : MODULE_CATALOG;
  const filtered = searching
    ? scopedModules.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase()))
    : scopedModules;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-ivory/8">
        <div className="flex items-center gap-1.5">
          {group && (
            <button
              onClick={() => setGroup(null)}
              aria-label="Volver a categorías"
              title="Volver a categorías"
              className="-ml-1.5 rounded-lg p-1 text-warmgray hover:bg-ivory/8 hover:text-ivory transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="font-display text-base font-semibold text-ivory">
            {group ? group.label : "Agregar módulo"}
          </h2>
        </div>
        <button onClick={closeSelector} className="text-warmgray hover:text-ivory transition-colors text-xl leading-none">&times;</button>
      </div>

      {/* Search — always searches the whole catalog when nothing is
          scoped yet (no group open), and narrows within the open group
          otherwise. */}
      <div className="px-4 pt-3 pb-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar módulo..."
          className="w-full rounded-xl border border-ivory/10 bg-ivory/5 px-3 py-2 text-sm text-ivory placeholder:text-warmgray/60 focus:border-brass/60 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {showLanding ? (
          // ── Category landing screen — the first thing the + button shows ──
          <div className="grid grid-cols-2 gap-3 pt-2">
            {SELECTOR_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroup(g)}
                className="flex flex-col items-center gap-2 rounded-xl border border-ivory/8 bg-ivory/4 px-3 py-6 text-center transition-all hover:border-brass/50 hover:bg-brass/8 active:scale-[0.97]"
              >
                <span className="text-3xl">{g.icon}</span>
                <span className="text-xs font-semibold text-ivory leading-tight">{g.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {filtered.length === 0 && (
              <p className="col-span-2 py-8 text-center text-sm text-warmgray">
                {group && scopedModules.length === 0 ? "Próximamente" : "No se encontraron módulos"}
              </p>
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
