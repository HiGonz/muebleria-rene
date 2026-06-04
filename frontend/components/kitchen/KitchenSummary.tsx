"use client";

import { useKitchenStore } from "@/store/useKitchenStore";
import { CATEGORY_ICONS } from "@/services/kitchenData";

export function KitchenSummary() {
  const { draft, getMaterials } = useKitchenStore();
  const { lines, summary } = getMaterials();

  const fmt = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

  if (draft.modules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="text-5xl opacity-40">📋</div>
        <p className="text-sm text-zinc-400">Agrega módulos al proyecto para ver el resumen de materiales y costos.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* Project header */}
      <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">{draft.projectName}</h2>
            <p className="mt-0.5 text-sm text-zinc-400">{draft.clientName} · {draft.clientPhone}</p>
          </div>
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">Borrador</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Distribución" value={draft.kitchenStyle} />
          <Stat label="Total módulos" value={String(draft.modules.length)} />
          <Stat label="Pared A" value={`${draft.wallALength} cm`} />
          <Stat label="Alto de techo" value={`${draft.ceilingHeight} cm`} />
        </div>
      </div>

      {/* Module overview */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Módulos del proyecto</p>
        <div className="space-y-1.5">
          {draft.modules
            .slice()
            .sort((a, b) => a.wall.localeCompare(b.wall) || a.position - b.position)
            .map((mod) => (
              <div key={mod.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-2.5">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: mod.options.color }} />
                <span className="text-base shrink-0">{CATEGORY_ICONS[mod.category]}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-white">{mod.label}</p>
                  <p className="text-[11px] text-zinc-500">{mod.dimensions.width}×{mod.dimensions.height}×{mod.dimensions.depth} cm · {mod.options.boardMaterial}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-zinc-400">Pared {mod.wall}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Material lines */}
      {lines.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Desglose de materiales</p>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Descripción</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Cant.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Unidad</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">P.U.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 py-2.5 text-zinc-300 text-xs">{line.description}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{line.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">{line.unit}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{fmt(line.unitCost)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-zinc-200 text-xs">{fmt(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="rounded-2xl border border-white/10 bg-white/4 p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Resumen de cotización</p>
        <div className="space-y-2">
          <CostRow label="Subtotal materiales" value={fmt(summary.subtotalMaterials)} />
          <CostRow label={`Mano de obra (${summary.laborPct}%)`} value={fmt(summary.laborCost)} />
          <CostRow label={`Utilidad (${summary.profitPct}%)`} value={fmt(summary.profitCost)} />
          <div className="border-t border-white/10 pt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-white">Total estimado</span>
              <span className="text-xl font-bold text-emerald-400">{fmt(summary.total)}</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-zinc-600">* Precio estimado. Los precios finales pueden variar según disponibilidad de materiales y costos de instalación.</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/4 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white truncate">{value}</p>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-zinc-200">{value}</span>
    </div>
  );
}
