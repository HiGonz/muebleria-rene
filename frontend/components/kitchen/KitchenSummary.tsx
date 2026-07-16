"use client";

import { Fragment, useRef, useState } from "react";
import type { KitchenModule } from "@/types/kitchen";
import { useKitchenStore } from "@/store/useKitchenStore";
import { CATEGORY_ICONS } from "@/services/kitchenData";
import { partColor } from "@/lib/cutColors";
import { KitchenReportPDF } from "./KitchenReportPDF";
import { ModuleSnapshotRig } from "./ModuleSnapshotRig";
import { exportKitchenReportPDF } from "@/services/exportKitchenPDF";

const DIAGRAM_WIDTH_PX = 90;

interface PieceInfo {
  lineIdx: number;
  sheetIdx: number;
  pieceIdx: number;
  part: string;
  width: number;
  height: number;
  pinned: boolean;
}

export function KitchenSummary() {
  const { draft, getMaterials } = useKitchenStore();
  const { lines, summary } = getMaterials();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pieceInfo, setPieceInfo] = useState<PieceInfo | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [moduleImages, setModuleImages] = useState<Record<string, string>>({});
  const [snapshotModules, setSnapshotModules] = useState<KitchenModule[] | null>(null);
  const snapshotResolverRef = useRef<((images: Record<string, string>) => void) | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const isSamePiece = (info: PieceInfo | null, lineIdx: number, sheetIdx: number, pieceIdx: number) =>
    !!info && info.lineIdx === lineIdx && info.sheetIdx === sheetIdx && info.pieceIdx === pieceIdx;
  const toggle = (i: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const fmt = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

  const captureModuleSnapshots = (modules: KitchenModule[]): Promise<Record<string, string>> =>
    new Promise((resolve) => {
      snapshotResolverRef.current = resolve;
      setSnapshotModules(modules);
    });

  const waitTwoFrames = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const handleExportPdf = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      // Screenshot each module's 3D preview first so the PDF's module gallery
      // has a real image, not just an icon.
      const images = await captureModuleSnapshots(draft.modules);
      setModuleImages(images);
      await waitTwoFrames(); // let the <img> tags actually paint before rasterizing pages

      const slug = draft.projectName.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cocina";
      const date = new Date().toISOString().slice(0, 10);
      await exportKitchenReportPDF(reportRef.current, `Cotizacion-${slug}-${date}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

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
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">Borrador</span>
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="rounded-full border border-indigo-500/40 bg-indigo-600/20 px-3 py-1 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-600/35 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? "Generando…" : "⬇ Exportar PDF"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total módulos" value={String(draft.modules.length)} />
          <Stat label="Ancho" value={`${draft.roomWidth} cm`} />
          <Stat label="Largo" value={`${draft.roomDepth} cm`} />
          <Stat label="Alto de techo" value={`${draft.ceilingHeight} cm`} />
        </div>
      </div>

      {/* Module overview */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Módulos del proyecto</p>
        <div className="space-y-1.5">
          {draft.modules
            .slice()
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((mod) => (
              <div key={mod.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-2.5">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: mod.options.color }} />
                <span className="text-base shrink-0">{CATEGORY_ICONS[mod.category]}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-white">{mod.label}</p>
                  <p className="text-[11px] text-zinc-500">{mod.dimensions.width}×{mod.dimensions.height}×{mod.dimensions.depth} cm · {mod.options.boardMaterial}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-zinc-400">{mod.rotation}°</span>
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
                {lines.map((line, i) => {
                  const hasExpand = !!(line.cutDetails?.length || line.subLines?.length);
                  const isOpen = expanded.has(i);
                  const scale = line.cutLayout ? DIAGRAM_WIDTH_PX / line.cutLayout.sheetWidthCm : 0;
                  const allParts = line.cutLayout
                    ? Array.from(new Set(line.cutLayout.sheets.flat().map((p) => p.part)))
                    : [];
                  return (
                    <Fragment key={i}>
                      <tr className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 text-zinc-300 text-xs">
                          <div className="flex items-center gap-1.5">
                            {hasExpand && (
                              <button
                                onClick={() => toggle(i)}
                                title="Ver desglose"
                                className={`shrink-0 text-zinc-500 transition-transform hover:text-white ${isOpen ? "rotate-90" : ""}`}
                              >
                                ▶
                              </button>
                            )}
                            <span>{line.description}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{line.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">{line.unit}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{fmt(line.unitCost)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-zinc-200 text-xs">{fmt(line.subtotal)}</td>
                      </tr>
                      {hasExpand && isOpen && (
                        <tr>
                          <td colSpan={5} className="bg-white/2 px-4 pb-3 pt-0">
                            <div className="ml-5 space-y-1 border-l border-white/10 pl-3">
                              {/* Hardware sub-items (e.g. "Herrajes" grouping Bisagras/Correderas) */}
                              {line.subLines?.map((s, j) => (
                                <div key={j} className="flex items-center justify-between text-[11px] text-zinc-500">
                                  <span>{s.label}</span>
                                  <span>{s.quantity} {s.unit} · {fmt(s.subtotal)}</span>
                                </div>
                              ))}

                              {/* Per-size cut breakdown (sheet lines) */}
                              {line.cutDetails?.map((d, j) => (
                                <div key={j} className="flex items-center justify-between text-[11px] text-zinc-500">
                                  <span>{d.part} — {d.width}×{d.height} cm</span>
                                  <span>{d.count} {d.count === 1 ? "corte" : "cortes"} · {d.areaM2.toFixed(2)} m²</span>
                                </div>
                              ))}

                              {/* Mini cut diagram — simple, referential layout of where each piece sits per sheet */}
                              {line.cutLayout && line.cutLayout.sheets.length > 0 && (
                                <div className="pt-2">
                                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-600">Plano de corte (referencial)</p>
                                  <div className="flex flex-wrap gap-3">
                                    {line.cutLayout.sheets.map((sheetPieces, si) => (
                                      <div key={si} className="flex flex-col items-center gap-1">
                                        <svg
                                          width={DIAGRAM_WIDTH_PX}
                                          height={line.cutLayout!.sheetHeightCm * scale}
                                          className="rounded border border-white/15 bg-[#0c0c18]"
                                        >
                                          {sheetPieces.map((p, pi) => {
                                            const active = isSamePiece(pieceInfo, i, si, pi);
                                            return (
                                              <rect
                                                key={pi}
                                                x={p.x * scale}
                                                y={p.y * scale}
                                                width={Math.max(p.width * scale - 1, 1)}
                                                height={Math.max(p.height * scale - 1, 1)}
                                                fill={partColor(p.part)}
                                                fillOpacity={active ? 0.9 : 0.55}
                                                stroke={active ? "#fff" : "#0c0c18"}
                                                strokeWidth={active ? 1.5 : 1}
                                                style={{ cursor: "pointer" }}
                                                onMouseEnter={() =>
                                                  setPieceInfo((cur) =>
                                                    cur?.pinned
                                                      ? cur
                                                      : { lineIdx: i, sheetIdx: si, pieceIdx: pi, part: p.part, width: p.width, height: p.height, pinned: false }
                                                  )
                                                }
                                                onMouseLeave={() =>
                                                  setPieceInfo((cur) => (cur && !cur.pinned && isSamePiece(cur, i, si, pi) ? null : cur))
                                                }
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setPieceInfo((cur) =>
                                                    cur?.pinned && isSamePiece(cur, i, si, pi)
                                                      ? null
                                                      : { lineIdx: i, sheetIdx: si, pieceIdx: pi, part: p.part, width: p.width, height: p.height, pinned: true }
                                                  );
                                                }}
                                              />
                                            );
                                          })}
                                        </svg>
                                        <span className="text-[9px] text-zinc-600">Hoja {si + 1}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-1.5 flex min-h-4.5 items-center">
                                    {pieceInfo?.lineIdx === i ? (
                                      <span className="flex items-center gap-1.5 rounded-md bg-white/8 px-2 py-0.5 text-[10px] text-zinc-200">
                                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: partColor(pieceInfo.part) }} />
                                        {pieceInfo.part} — {pieceInfo.width}×{pieceInfo.height} cm
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-zinc-600">Pasa el mouse o haz click sobre una pieza para identificarla</span>
                                    )}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                    {allParts.map((part) => (
                                      <span key={part} className="flex items-center gap-1 text-[10px] text-zinc-500">
                                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: partColor(part) }} />
                                        {part}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cost distribution by category */}
      {summary.categoryBreakdown.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Distribución del costo de materiales</p>
          <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/4 p-4">
            {summary.categoryBreakdown.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300">{c.label}</span>
                  <span className="text-zinc-400">{c.pct}% · {fmt(c.subtotal)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
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

      {/* Off-screen printable report, rasterized page-by-page into the exported PDF */}
      <div className="pointer-events-none fixed left-0 top-0 -z-50 -translate-x-[9999px]">
        <KitchenReportPDF ref={reportRef} draft={draft} lines={lines} summary={summary} moduleImages={moduleImages} />
      </div>

      {/* Sequentially screenshots each module's 3D preview before export starts */}
      {snapshotModules && (
        <ModuleSnapshotRig
          modules={snapshotModules}
          onDone={(images) => {
            setSnapshotModules(null);
            snapshotResolverRef.current?.(images);
            snapshotResolverRef.current = null;
          }}
        />
      )}
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
