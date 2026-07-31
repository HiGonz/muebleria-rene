"use client";

import { forwardRef } from "react";
import type { KitchenDraft, KitchenMaterialLine, KitchenModule, KitchenQuoteSummary } from "@/types/kitchen";
import { CATEGORY_ICONS } from "@/services/kitchenData";
import { partColor } from "@/lib/cutColors";

// A4 at 96dpi — each [data-pdf-page] div is rasterized as one PDF page by
// services/exportKitchenPDF.ts (which scales it to fit, so overflow just
// means a taller-than-usual page instead of cropped content).
const PAGE_W = 794;
const PAGE_H = 1123;

// html2canvas 1.4.1 can't parse the oklch()/lab() colors Tailwind v4 emits for
// its named color classes, so every color in this printable report is set via
// inline hex styles instead of Tailwind color utilities (layout utilities —
// flex/grid/spacing/radius/font-size — are colorless and safe to keep).
const C = {
  ink900: "#18181b",
  ink800: "#27272a",
  ink700: "#3f3f46",
  ink600: "#52525b",
  ink500: "#71717a",
  ink400: "#a1a1aa",
  line100: "#f4f4f5",
  line200: "#e4e4e7",
  line300: "#d4d4d8",
  line400: "#a1a1aa",
  subtleBg: "#fafafa",
  white: "#ffffff",
  brass600: "#a3743c",
  brass200: "#ecd9bc",
  emerald600: "#059669",
};

const CATEGORY_LABELS: Record<string, string> = {
  lower: "Bajo", upper: "Alto", tower: "Torre",
  countertop: "Cubierta", appliance: "Electrodoméstico", accessory: "Accesorio",
};

const fmt = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Greedily packs material lines into pages by an estimated "weight" so pages
// with cut diagrams don't get overloaded, without needing real DOM measurement.
function chunkMaterialLines(lines: KitchenMaterialLine[]): KitchenMaterialLine[][] {
  const CAPACITY = 10;
  const pages: KitchenMaterialLine[][] = [];
  let current: KitchenMaterialLine[] = [];
  let used = 0;
  for (const line of lines) {
    const weight = line.cutLayout && line.cutLayout.sheets.length > 0 ? 4 : line.subLines?.length ? 2 : 1;
    if (current.length > 0 && used + weight > CAPACITY) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(line);
    used += weight;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

interface ReportProps {
  draft: KitchenDraft;
  lines: KitchenMaterialLine[];
  summary: KitchenQuoteSummary;
  /** Data-URL screenshot of each module's 3D preview, keyed by module id (see ModuleSnapshotRig). */
  moduleImages?: Record<string, string>;
}

export const KitchenReportPDF = forwardRef<HTMLDivElement, ReportProps>(function KitchenReportPDF(
  { draft, lines, summary, moduleImages = {} },
  ref
) {
  const modulePages = chunk(draft.modules, 6);
  const materialPages = chunkMaterialLines(lines);
  const totalPages = 1 + modulePages.length + materialPages.length + 1;
  const today = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  let pageCursor = 1;

  return (
    <div ref={ref}>
      <CoverPage draft={draft} summary={summary} today={today} pageNum={pageCursor++} totalPages={totalPages} />
      {modulePages.map((mods, i) => (
        <ModulesPage
          key={`mod-${i}`}
          modules={mods}
          moduleImages={moduleImages}
          sectionPage={i + 1}
          sectionTotal={modulePages.length}
          pageNum={pageCursor++}
          totalPages={totalPages}
        />
      ))}
      {materialPages.map((linesChunk, i) => (
        <MaterialsPage
          key={`mat-${i}`}
          lines={linesChunk}
          sectionPage={i + 1}
          sectionTotal={materialPages.length}
          pageNum={pageCursor++}
          totalPages={totalPages}
        />
      ))}
      <TotalsPage summary={summary} draft={draft} pageNum={pageCursor++} totalPages={totalPages} />
    </div>
  );
});

// ─── Shared chrome ─────────────────────────────────────────────────────────────
function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
        style={{ backgroundColor: C.brass600, color: C.white }}
      >
        MR
      </div>
      <div>
        <p className="text-lg font-bold leading-tight" style={{ color: C.ink900 }}>Mueblería Rene</p>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: C.ink500 }}>Cocinas integrales y muebles a medida</p>
      </div>
    </div>
  );
}

function ReportHeader({ title, today }: { title: string; today: string }) {
  return (
    <div className="mb-6 flex items-start justify-between border-b-2 pb-4" style={{ borderColor: C.brass600 }}>
      <BrandMark />
      <div className="text-right text-xs" style={{ color: C.ink500 }}>
        <p className="text-sm font-semibold" style={{ color: C.ink800 }}>{title}</p>
        <p className="mt-0.5">{today}</p>
      </div>
    </div>
  );
}

function ReportFooter({ pageNum, totalPages }: { pageNum: number; totalPages: number }) {
  return (
    <div className="mt-auto flex items-center justify-between border-t pt-3 text-[10px]" style={{ borderColor: C.line200, color: C.ink400 }}>
      <span>Mueblería Rene · Cotización de cocina integral</span>
      <span>
        Página {pageNum} de {totalPages}
      </span>
    </div>
  );
}

function Page({
  children,
  pageNum,
  totalPages,
  title,
  today,
}: {
  children: React.ReactNode;
  pageNum: number;
  totalPages: number;
  title: string;
  today: string;
}) {
  return (
    <div
      data-pdf-page
      className="flex flex-col p-12"
      style={{ width: PAGE_W, minHeight: PAGE_H, backgroundColor: C.white }}
    >
      <ReportHeader title={title} today={today} />
      <div className="flex-1">{children}</div>
      <ReportFooter pageNum={pageNum} totalPages={totalPages} />
    </div>
  );
}

// ─── Cover page ────────────────────────────────────────────────────────────────
function CoverPage({
  draft,
  summary,
  today,
  pageNum,
  totalPages,
}: {
  draft: KitchenDraft;
  summary: KitchenQuoteSummary;
  today: string;
  pageNum: number;
  totalPages: number;
}) {
  return (
    <Page pageNum={pageNum} totalPages={totalPages} title="Cotización" today={today}>
      <h1 className="mt-4 text-3xl font-bold" style={{ color: C.ink900 }}>{draft.projectName}</h1>
      <p className="mt-1 text-sm" style={{ color: C.ink500 }}>Cotización profesional de cocina integral</p>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <div className="rounded-2xl border p-5" style={{ borderColor: C.line200 }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink500 }}>Cliente</p>
          <p className="mt-3 text-sm" style={{ color: C.ink800 }}>Nombre: {draft.clientName || "—"}</p>
          <p className="text-sm" style={{ color: C.ink800 }}>Teléfono: {draft.clientPhone || "—"}</p>
        </div>
        <div className="rounded-2xl border p-5" style={{ borderColor: C.line200 }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink500 }}>Espacio</p>
          <p className="mt-3 text-sm" style={{ color: C.ink800 }}>Ancho: {draft.roomWidth} cm</p>
          <p className="text-sm" style={{ color: C.ink800 }}>Largo: {draft.roomDepth} cm</p>
          <p className="text-sm" style={{ color: C.ink800 }}>Altura de techo: {draft.ceilingHeight} cm</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat label="Módulos" value={String(draft.modules.length)} />
        <Stat label="Mano de obra" value={`${summary.laborPct}%`} />
        <Stat label="Utilidad" value={`${summary.profitPct}%`} />
      </div>

      <div className="mt-8 rounded-2xl p-6" style={{ backgroundColor: C.brass600, color: C.white }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.brass200 }}>Total estimado del proyecto</p>
        <p className="mt-1 text-4xl font-bold">{fmt(summary.total)}</p>
        <p className="mt-1 text-xs" style={{ color: C.brass200 }}>Incluye materiales, mano de obra y utilidad</p>
      </div>

      {draft.notes && (
        <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: C.line200 }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink500 }}>Notas</p>
          <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: C.ink700 }}>{draft.notes}</p>
        </div>
      )}

      <p className="mt-8 text-xs" style={{ color: C.ink400 }}>
        Este documento incluye el detalle de módulos, materiales, planos de corte y costos del proyecto.
        Cotización válida por 15 días. Precios sujetos a disponibilidad de materiales.
      </p>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: C.line100 }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: C.ink500 }}>{label}</p>
      <p className="mt-0.5 text-base font-semibold" style={{ color: C.ink900 }}>{value}</p>
    </div>
  );
}

// ─── Modules page (visual gallery — one card per module to build) ─────────────
function ModulesPage({
  modules,
  moduleImages,
  sectionPage,
  sectionTotal,
  pageNum,
  totalPages,
}: {
  modules: KitchenModule[];
  moduleImages: Record<string, string>;
  sectionPage: number;
  sectionTotal: number;
  pageNum: number;
  totalPages: number;
}) {
  return (
    <Page pageNum={pageNum} totalPages={totalPages} title="Cotización" today="">
      <h2 className="mb-1 text-lg font-bold" style={{ color: C.ink900 }}>
        Módulos del proyecto {sectionTotal > 1 ? `(${sectionPage}/${sectionTotal})` : ""}
      </h2>
      <p className="mb-4 text-xs" style={{ color: C.ink500 }}>Vista de cada mueble por construir, con sus medidas y material.</p>
      <div className="grid grid-cols-2 gap-4">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} mod={mod} image={moduleImages[mod.id]} />
        ))}
      </div>
    </Page>
  );
}

function ModuleCard({ mod, image }: { mod: KitchenModule; image?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.line200 }}>
      <div
        className="flex h-44 w-full items-center justify-center overflow-hidden rounded-lg"
        style={{ backgroundColor: "#080810" }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={mod.label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-4xl opacity-60">{CATEGORY_ICONS[mod.category]}</span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: mod.options.color }}
        />
        <p className="truncate text-sm font-semibold" style={{ color: C.ink900 }}>{mod.label}</p>
      </div>
      <p className="mt-0.5 text-[11px]" style={{ color: C.ink500 }}>
        {CATEGORY_LABELS[mod.category] ?? mod.category} · {mod.dimensions.width} × {mod.dimensions.height} × {mod.dimensions.depth} cm
      </p>
      <p className="text-[11px]" style={{ color: C.ink500 }}>{mod.options.boardMaterial} · {mod.rotation}° rotación</p>
    </div>
  );
}

// ─── Materials + cut-plan pages ────────────────────────────────────────────────
const DIAGRAM_W = 130;

function MaterialsPage({
  lines,
  sectionPage,
  sectionTotal,
  pageNum,
  totalPages,
}: {
  lines: KitchenMaterialLine[];
  sectionPage: number;
  sectionTotal: number;
  pageNum: number;
  totalPages: number;
}) {
  return (
    <Page pageNum={pageNum} totalPages={totalPages} title="Cotización" today="">
      <h2 className="mb-1 text-lg font-bold" style={{ color: C.ink900 }}>
        Materiales y plano de corte {sectionTotal > 1 ? `(${sectionPage}/${sectionTotal})` : ""}
      </h2>
      <p className="mb-4 text-xs" style={{ color: C.ink500 }}>Desglose de materiales, medidas de corte y ubicación referencial en hoja.</p>
      <div className="space-y-5">
        {lines.map((line, i) => (
          <MaterialLineBlock key={i} line={line} />
        ))}
      </div>
    </Page>
  );
}

function MaterialLineBlock({ line }: { line: KitchenMaterialLine }) {
  const scale = line.cutLayout ? DIAGRAM_W / line.cutLayout.sheetWidthCm : 0;
  const allParts = line.cutLayout
    ? Array.from(new Set(line.cutLayout.sheets.flat().map((p) => p.part)))
    : [];

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: C.line200 }}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold" style={{ color: C.ink900 }}>{line.description}</span>
        <span style={{ color: C.ink600 }}>
          {line.quantity} {line.unit} · {fmt(line.unitCost)} c/u ·{" "}
          <span className="font-semibold" style={{ color: C.ink900 }}>{fmt(line.subtotal)}</span>
        </span>
      </div>

      {/* Hardware sub-items */}
      {line.subLines && line.subLines.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t pt-2" style={{ borderColor: C.line100 }}>
          {line.subLines.map((s, j) => (
            <div key={j} className="flex items-center justify-between text-[11px]" style={{ color: C.ink600 }}>
              <span>{s.label}</span>
              <span>
                {s.quantity} {s.unit} · {fmt(s.subtotal)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Exact cut measurements */}
      {line.cutDetails && line.cutDetails.length > 0 && (
        <table className="mt-2 w-full border-t pt-1 text-[11px]" style={{ borderColor: C.line100 }}>
          <tbody>
            {line.cutDetails.map((d, j) => (
              <tr key={j}>
                <td className="py-0.5 pr-2" style={{ color: C.ink700 }}>{d.part}</td>
                <td className="py-0.5 pr-2" style={{ color: C.ink500 }}>
                  {d.width} × {d.height} cm
                </td>
                <td className="py-0.5 pr-2" style={{ color: C.ink500 }}>
                  {d.count} {d.count === 1 ? "corte" : "cortes"}
                </td>
                <td className="py-0.5 text-right" style={{ color: C.ink500 }}>{d.areaM2.toFixed(2)} m²</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Cut diagrams */}
      {line.cutLayout && line.cutLayout.sheets.length > 0 && (
        <div className="mt-3 border-t pt-2" style={{ borderColor: C.line100 }}>
          <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: C.ink400 }}>
            Plano de corte (referencial) — hoja {line.cutLayout.sheetWidthCm}×{line.cutLayout.sheetHeightCm} cm
          </p>
          <div className="flex flex-wrap gap-3">
            {line.cutLayout.sheets.map((sheetPieces, si) => (
              <div key={si} className="flex flex-col items-center gap-1">
                <svg
                  width={DIAGRAM_W}
                  height={line.cutLayout!.sheetHeightCm * scale}
                  className="rounded"
                  style={{ border: `1px solid ${C.line300}`, backgroundColor: C.subtleBg }}
                >
                  {sheetPieces.map((p, pi) => (
                    <rect
                      key={pi}
                      x={p.x * scale}
                      y={p.y * scale}
                      width={Math.max(p.width * scale - 1, 1)}
                      height={Math.max(p.height * scale - 1, 1)}
                      fill={partColor(p.part)}
                      fillOpacity={0.65}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  ))}
                </svg>
                <span className="text-[9px]" style={{ color: C.ink400 }}>Hoja {si + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {allParts.map((part) => (
              <span key={part} className="flex items-center gap-1 text-[10px]" style={{ color: C.ink500 }}>
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: partColor(part) }} />
                {part}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Totals page ───────────────────────────────────────────────────────────────
function TotalsPage({
  summary,
  draft,
  pageNum,
  totalPages,
}: {
  summary: KitchenQuoteSummary;
  draft: KitchenDraft;
  pageNum: number;
  totalPages: number;
}) {
  return (
    <Page pageNum={pageNum} totalPages={totalPages} title="Cotización" today="">
      <h2 className="mb-4 text-lg font-bold" style={{ color: C.ink900 }}>Resumen de costos</h2>

      {summary.categoryBreakdown.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink500 }}>
            Distribución del costo de materiales
          </p>
          <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: C.line200 }}>
            {summary.categoryBreakdown.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: C.ink700 }}>{c.label}</span>
                  <span style={{ color: C.ink500 }}>
                    {c.pct}% · {fmt(c.subtotal)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: C.line100 }}>
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: C.brass600 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border p-5" style={{ borderColor: C.line200 }}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: C.ink500 }}>Cotización final</p>
        <div className="space-y-2 text-sm">
          <CostRow label="Subtotal materiales" value={fmt(summary.subtotalMaterials)} />
          <CostRow label={`Mano de obra (${summary.laborPct}%)`} value={fmt(summary.laborCost)} />
          <CostRow label={`Utilidad (${summary.profitPct}%)`} value={fmt(summary.profitCost)} />
          <div className="border-t pt-3" style={{ borderColor: C.line200 }}>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold" style={{ color: C.ink900 }}>Total estimado</span>
              <span className="text-2xl font-bold" style={{ color: C.emerald600 }}>{fmt(summary.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px]" style={{ color: C.ink400 }}>
        * Precio estimado. Los precios finales pueden variar según disponibilidad de materiales y costos de instalación.
        Cotización válida por 15 días a partir de su fecha de emisión.
      </p>

      <div className="mt-16 grid grid-cols-2 gap-10 text-xs" style={{ color: C.ink500 }}>
        <div>
          <div className="border-t pt-2" style={{ borderColor: C.line400 }}>Firma — Mueblería Rene</div>
        </div>
        <div>
          <div className="border-t pt-2" style={{ borderColor: C.line400 }}>Firma — {draft.clientName || "Cliente"}</div>
        </div>
      </div>
    </Page>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: C.ink600 }}>{label}</span>
      <span className="font-medium" style={{ color: C.ink800 }}>{value}</span>
    </div>
  );
}
