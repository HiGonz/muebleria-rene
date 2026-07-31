"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { KitchenMaterialLine, KitchenModule } from "@/types/kitchen";
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
  moduleLabel?: string;
}

export function KitchenSummary() {
  const { draft, getMaterials } = useKitchenStore();
  const { lines, summary } = getMaterials();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pieceInfo, setPieceInfo] = useState<PieceInfo | null>(null);
  // "¿en qué hojas está usando este mueble?" — pick a module from the picker
  // below and its pieces light up (and their sheet lines auto-open) across
  // the cut diagrams, instead of having to eyeball colors/labels per piece.
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const selectedModule = draft.modules.find((m) => m.id === selectedModuleId) ?? null;
  const lineHasModule = (line: KitchenMaterialLine, moduleId: string) =>
    !!line.cutLayout?.sheets.some((sheet) => sheet.some((p) => p.moduleId === moduleId));
  const [isExporting, setIsExporting] = useState(false);
  const [moduleImages, setModuleImages] = useState<Record<string, string>>({});
  const [snapshotModules, setSnapshotModules] = useState<KitchenModule[] | null>(null);
  const snapshotResolverRef = useRef<((images: Record<string, string>) => void) | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const materialsSectionRef = useRef<HTMLDivElement>(null);
  const isSamePiece = (info: PieceInfo | null, lineIdx: number, sheetIdx: number, pieceIdx: number) =>
    !!info && info.lineIdx === lineIdx && info.sheetIdx === sheetIdx && info.pieceIdx === pieceIdx;
  const toggle = (i: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Selecting a module scrolls its cuts into view — the picker sits well
  // above the material breakdown on phone, and even on desktop/tablet (where
  // the picker stays put in its own sticky column afterward) this saves the
  // very first manual scroll.
  useEffect(() => {
    if (selectedModuleId) materialsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedModuleId]);

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
        <p className="text-sm text-warmgray">Agrega módulos al proyecto para ver el resumen de materiales y costos.</p>
      </div>
    );
  }

  const sortedModules = draft.modules.slice().sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Project header */}
      <div className="rounded-2xl border border-ivory/10 bg-ivory/4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ivory">{draft.projectName}</h2>
            <p className="mt-0.5 text-sm text-warmgray">{draft.clientName} · {draft.clientPhone}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">Borrador</span>
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="rounded-full border border-brass/40 bg-brass/15 px-3 py-1 text-xs font-semibold text-brass-soft transition-colors hover:bg-brass/25 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Below md: single column, module picker collapses to a compact
          horizontal strip so it doesn't eat the scroll budget before the
          material breakdown. md and up: the picker becomes a sticky sidebar
          that stays on screen while the right column scrolls, so switching
          modules never costs a re-scroll. */}
      <div className="md:flex md:items-start md:gap-6">
        <aside className="md:sticky md:top-6 md:w-64 md:shrink-0 lg:w-72">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Módulos del proyecto</p>
            <p className="mt-0.5 text-[11px] text-warmgray/70">Selecciona uno para ver sus cortes en las hojas</p>
          </div>

          {/* Phone: compact chips, swipeable, one line tall */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide md:hidden">
            {sortedModules.map((mod) => {
              const isSelected = selectedModuleId === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setSelectedModuleId((cur) => (cur === mod.id ? null : mod.id))}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    isSelected ? "border-brass bg-brass/15 text-brass-soft" : "border-ivory/10 bg-ivory/5 text-ivory/70"
                  }`}
                >
                  <span className="text-sm leading-none">{CATEGORY_ICONS[mod.category]}</span>
                  <span className="max-w-28 truncate">{mod.label}</span>
                </button>
              );
            })}
          </div>

          {/* md and up: full detail list, own independent scroll once it
              outgrows the viewport so it never breaks out of the sticky column. */}
          <div className="hidden space-y-1.5 md:block md:max-h-[calc(100vh-11rem)] md:overflow-y-auto md:pr-1">
            {sortedModules.map((mod) => {
              const isSelected = selectedModuleId === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setSelectedModuleId((cur) => (cur === mod.id ? null : mod.id))}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                    isSelected ? "border-brass bg-brass/10" : "border-ivory/8 bg-ivory/4 hover:border-ivory/20"
                  }`}
                >
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: mod.options.color }} />
                  <span className="text-base shrink-0">{CATEGORY_ICONS[mod.category]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-ivory">{mod.label}</p>
                    <p className="text-[11px] text-warmgray">{mod.dimensions.width}×{mod.dimensions.height}×{mod.dimensions.depth} cm · {mod.options.boardMaterial}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-ivory/6 px-2 py-0.5 text-[10px] text-warmgray">{mod.rotation}°</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="mt-6 min-w-0 flex-1 space-y-6 md:mt-0">
          {/* Material lines */}
          {lines.length > 0 && (
            <div ref={materialsSectionRef} className="scroll-mt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Desglose de materiales</p>
                {selectedModule && (
                  <button
                    type="button"
                    onClick={() => setSelectedModuleId(null)}
                    className="flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/10 py-1 pl-3 pr-2 text-[11px] font-medium text-brass-soft transition-colors hover:bg-brass/20"
                  >
                    Mostrando: {selectedModule.label}
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-2xl border border-ivory/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ivory/8 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-warmgray">Descripción</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-warmgray">Cant.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-warmgray">Unidad</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-warmgray">P.U.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-warmgray">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory/5">
                    {lines.map((line, i) => {
                      const hasExpand = !!(line.cutDetails?.length || line.subLines?.length);
                      const matchesSelected = !!selectedModuleId && lineHasModule(line, selectedModuleId);
                      // A selected module auto-opens any sheet line that actually
                      // has one of its pieces, on top of whatever the user's
                      // already manually expanded.
                      const isOpen = expanded.has(i) || matchesSelected;
                      const scale = line.cutLayout ? DIAGRAM_WIDTH_PX / line.cutLayout.sheetWidthCm : 0;
                      const allParts = line.cutLayout
                        ? Array.from(new Set(line.cutLayout.sheets.flat().map((p) => p.part)))
                        : [];
                      // With a module selected, skip straight past every sheet
                      // that doesn't have one of its pieces — reviewing "where
                      // is my cabinet's material" shouldn't mean scrolling past
                      // a dozen unrelated sheets to spot the 2-3 that matter.
                      const sheetsToShow = (line.cutLayout?.sheets ?? [])
                        .map((sheetPieces, si) => ({ sheetPieces, si }))
                        .filter(({ sheetPieces }) => !selectedModuleId || sheetPieces.some((p) => p.moduleId === selectedModuleId));
                      const hiddenSheetCount = (line.cutLayout?.sheets.length ?? 0) - sheetsToShow.length;
                      return (
                        <Fragment key={i}>
                          <tr className="hover:bg-ivory/3 transition-colors">
                            <td className="px-4 py-2.5 text-ivory/80 text-xs">
                              <div className="flex items-center gap-1.5">
                                {hasExpand && (
                                  <button
                                    onClick={() => toggle(i)}
                                    title="Ver desglose"
                                    className={`shrink-0 text-warmgray transition-transform hover:text-ivory ${isOpen ? "rotate-90" : ""}`}
                                  >
                                    ▶
                                  </button>
                                )}
                                <span>{line.description}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-warmgray text-xs">{line.quantity}</td>
                            <td className="px-4 py-2.5 text-right text-warmgray text-xs">{line.unit}</td>
                            <td className="px-4 py-2.5 text-right text-warmgray text-xs">{fmt(line.unitCost)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-ivory/90 text-xs">{fmt(line.subtotal)}</td>
                          </tr>
                          {hasExpand && isOpen && (
                            <tr>
                              <td colSpan={5} className="bg-ivory/2 px-4 pb-3 pt-0">
                                <div className="ml-5 space-y-1 border-l border-ivory/10 pl-3">
                                  {/* Hardware sub-items (e.g. "Herrajes" grouping Bisagras/Correderas) */}
                                  {line.subLines?.map((s, j) => (
                                    <div key={j} className="flex items-center justify-between text-[11px] text-warmgray">
                                      <span>{s.label}</span>
                                      <span>{s.quantity} {s.unit} · {fmt(s.subtotal)}</span>
                                    </div>
                                  ))}

                                  {/* Per-size cut breakdown (sheet lines) */}
                                  {line.cutDetails?.map((d, j) => (
                                    <div key={j} className="flex items-center justify-between text-[11px] text-warmgray">
                                      <span>{d.part} — {d.width}×{d.height} cm</span>
                                      <span>{d.count} {d.count === 1 ? "corte" : "cortes"} · {d.areaM2.toFixed(2)} m²</span>
                                    </div>
                                  ))}

                                  {/* Mini cut diagram — simple, referential layout of where each piece sits per sheet */}
                                  {line.cutLayout && line.cutLayout.sheets.length > 0 && (
                                    <div className="pt-2">
                                      <div className="mb-1.5 flex items-center justify-between gap-2">
                                        <p className="text-[10px] uppercase tracking-wide text-warmgray/70">Plano de corte (referencial)</p>
                                        {selectedModuleId && hiddenSheetCount > 0 && (
                                          <p className="text-[10px] text-warmgray/60">{sheetsToShow.length} de {line.cutLayout.sheets.length} hojas usan este mueble</p>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-3">
                                        {sheetsToShow.map(({ sheetPieces, si }) => (
                                          <div key={si} className="flex flex-col items-center gap-1">
                                            <svg
                                              width={DIAGRAM_WIDTH_PX}
                                              height={line.cutLayout!.sheetHeightCm * scale}
                                              className="rounded border border-ivory/15 bg-ink"
                                            >
                                              {sheetPieces.map((p, pi) => {
                                                const active = isSamePiece(pieceInfo, i, si, pi);
                                                // Dim every piece that isn't the selected module's own,
                                                // so its cuts pop out at a glance instead of blending
                                                // into the rest of the sheet.
                                                const dimmed = !!selectedModuleId && p.moduleId !== selectedModuleId;
                                                const isSelectedPiece = !!selectedModuleId && p.moduleId === selectedModuleId;
                                                return (
                                                  <rect
                                                    key={pi}
                                                    x={p.x * scale}
                                                    y={p.y * scale}
                                                    width={Math.max(p.width * scale - 1, 1)}
                                                    height={Math.max(p.height * scale - 1, 1)}
                                                    fill={partColor(p.part)}
                                                    fillOpacity={active ? 0.95 : dimmed ? 0.12 : 0.55}
                                                    stroke={active || isSelectedPiece ? "#c1904f" : "#15110c"}
                                                    strokeWidth={active || isSelectedPiece ? 1.5 : 1}
                                                    style={{ cursor: "pointer" }}
                                                    onMouseEnter={() =>
                                                      setPieceInfo((cur) =>
                                                        cur?.pinned
                                                          ? cur
                                                          : { lineIdx: i, sheetIdx: si, pieceIdx: pi, part: p.part, width: p.width, height: p.height, moduleLabel: p.moduleLabel, pinned: false }
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
                                                          : { lineIdx: i, sheetIdx: si, pieceIdx: pi, part: p.part, width: p.width, height: p.height, moduleLabel: p.moduleLabel, pinned: true }
                                                      );
                                                    }}
                                                  />
                                                );
                                              })}
                                            </svg>
                                            <span className="text-[9px] text-warmgray/70">Hoja {si + 1}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-1.5 flex min-h-4.5 items-center">
                                        {pieceInfo?.lineIdx === i ? (
                                          <span className="flex items-center gap-1.5 rounded-md bg-ivory/8 px-2 py-0.5 text-[10px] text-ivory/90">
                                            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: partColor(pieceInfo.part) }} />
                                            {pieceInfo.part} — {pieceInfo.width}×{pieceInfo.height} cm
                                            {pieceInfo.moduleLabel && <span className="text-brass-soft">· {pieceInfo.moduleLabel}</span>}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-warmgray/70">Pasa el mouse o haz click sobre una pieza para identificarla</span>
                                        )}
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                        {allParts.map((part) => (
                                          <span key={part} className="flex items-center gap-1 text-[10px] text-warmgray">
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
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-warmgray">Distribución del costo de materiales</p>
              <div className="space-y-2.5 rounded-2xl border border-ivory/10 bg-ivory/4 p-4">
                {summary.categoryBreakdown.map((c) => (
                  <div key={c.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ivory/80">{c.label}</span>
                      <span className="text-warmgray">{c.pct}% · {fmt(c.subtotal)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ivory/8">
                      <div className="h-full rounded-full bg-brass" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-2xl border border-ivory/10 bg-ivory/4 p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Resumen de cotización</p>
            <div className="space-y-2">
              <CostRow label="Subtotal materiales" value={fmt(summary.subtotalMaterials)} />
              <CostRow label={`Mano de obra (${summary.laborPct}%)`} value={fmt(summary.laborCost)} />
              <CostRow label={`Utilidad (${summary.profitPct}%)`} value={fmt(summary.profitCost)} />
              <div className="border-t border-ivory/10 pt-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-base font-semibold text-ivory">Total estimado</span>
                  <span className="text-xl font-bold text-sage">{fmt(summary.total)}</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-warmgray/70">* Precio estimado. Los precios finales pueden variar según disponibilidad de materiales y costos de instalación.</p>
          </div>
        </div>
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
    <div className="rounded-xl bg-ivory/4 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-warmgray">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ivory truncate">{value}</p>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-warmgray">{label}</span>
      <span className="text-sm font-medium text-ivory/90">{value}</span>
    </div>
  );
}
