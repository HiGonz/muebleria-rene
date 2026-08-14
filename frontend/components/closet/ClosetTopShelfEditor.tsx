"use client";

import { useClosetStore } from "@/store/useClosetStore";
import type { ClosetConjunto } from "@/types/closet";

// The repisa superior covers a CONTIGUOUS run of the conjunto's modules
// (left-to-right, matching their stacking order — see stackAlongAxis).
// Rather than free-form multi-select (which could produce a non-contiguous
// or gapped selection the data model forbids), this offers "desde"/"hasta"
// dropdowns over the module list — any pair of indices necessarily picks a
// contiguous run, so there's nothing left to validate.
export function ClosetTopShelfEditor({ conjunto }: { conjunto: ClosetConjunto }) {
  const setTopShelf = useClosetStore((s) => s.setTopShelf);
  const removeTopShelf = useClosetStore((s) => s.removeTopShelf);

  const modules = conjunto.modules;
  const covered = conjunto.topShelf?.coversModuleIds ?? [];
  const startIdx = covered.length ? modules.findIndex((m) => m.id === covered[0]) : 0;
  const endIdx = covered.length ? modules.findIndex((m) => m.id === covered[covered.length - 1]) : modules.length - 1;

  if (modules.length === 0) {
    return (
      <div className="border-b border-ivory/8 p-3">
        <p className="text-xs font-semibold text-ivory">Repisa superior</p>
        <p className="mt-1 text-[10px] text-warmgray">Agrega al menos un módulo primero.</p>
      </div>
    );
  }

  const handleRangeChange = (fromIdx: number, toIdx: number) => {
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    setTopShelf(conjunto.id, modules.slice(lo, hi + 1).map((m) => m.id));
  };

  return (
    <div className="border-b border-ivory/8 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ivory">Repisa superior</p>
        {conjunto.topShelf && (
          <button onClick={() => removeTopShelf(conjunto.id)} className="text-[10px] text-terracotta hover:underline">
            Quitar
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-warmgray">
          Desde
          <select
            value={startIdx}
            onChange={(e) => handleRangeChange(Number(e.target.value), endIdx)}
            className="rounded border border-ivory/15 bg-ink px-1.5 py-1 text-xs text-ivory"
          >
            {modules.map((m, i) => (
              <option key={m.id} value={i}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-warmgray">
          Hasta
          <select
            value={endIdx}
            onChange={(e) => handleRangeChange(startIdx, Number(e.target.value))}
            className="rounded border border-ivory/15 bg-ink px-1.5 py-1 text-xs text-ivory"
          >
            {modules.map((m, i) => (
              <option key={m.id} value={i}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
