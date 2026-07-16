// ─── 2D sheet-cutting estimator ────────────────────────────────────────────────
// Estimates how many whole stock sheets are needed to cut a list of rectangular
// panels. Deliberately NOT (totalPanelArea / sheetArea) rounded up — that
// under-counts in practice because leftover offcuts from one panel frequently
// can't be recombined into another panel of the size actually needed. Instead
// this runs a guillotine best-fit bin-packing heuristic: each panel is placed
// into the least-wasteful open rectangle of an already-opened sheet (rotated if
// that fits better), only opens a new sheet when none fits, and afterward tries
// several piece orderings plus a sheet-consolidation pass, keeping the best result.

export interface CutPiece {
  width: number;  // cm
  height: number; // cm
  label?: string; // optional part name, carried through to the placement for cut-diagram labeling
}

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutPlacement {
  sheet: number;   // 0-indexed sheet number this piece was cut from
  x: number;       // cm, from the sheet's top-left corner
  y: number;       // cm
  width: number;   // cm — the piece's actual (post-rotation) placed width
  height: number;  // cm
  rotated: boolean;
  label?: string;
}

// ─── Debug types (only populated when packSheets(..., debug=true)) ───────────
export interface PackDebugCandidate {
  sheet: number;
  rectIndex: number;
  rect: FreeRect;
  rotated: boolean;
  score: number;
  chosen: boolean;
  rejectedReason?: string;
}
export interface PackDebugPieceEntry {
  piece: { width: number; height: number; label?: string };
  rotated: boolean;
  sheet: number;
  chosenRect: FreeRect;
  candidates: PackDebugCandidate[];
}
export interface PackDebugSheetSummary {
  sheet: number;
  freeRects: FreeRect[];
  usedAreaCm2: number;
  freeAreaCm2: number;
  largestFreeRect: FreeRect | null;
  utilizationPct: number;
}
export interface PackDebugHeuristicResult {
  strategy: string;
  sheets: number;
  utilizationPct: number;
  wasteCm2: number;
}
export interface PackDebugMove {
  label: string | undefined;
  fromSheet: number;
  toSheet: number;
}
export interface PackDebugLog {
  strategy: string; // the winning heuristic's name
  pieces: PackDebugPieceEntry[];
  sheets: PackDebugSheetSummary[];
  postOptimizationMoves: PackDebugMove[];
  heuristicComparison: PackDebugHeuristicResult[];
}

export interface PackResult {
  sheets: number;
  pieceCount: number;
  usedAreaCm2: number;   // sum of the pieces' own area (no kerf/waste)
  boughtAreaCm2: number; // sheets * one sheet's area
  utilizationPct: number;
  placements: CutPlacement[]; // per-piece sheet position, for rendering a simple cut diagram
  debugLog?: PackDebugLog;    // only present when called with debug=true
}

// Saw-kerf / trim allowance added per piece so adjacent cuts don't collide.
const KERF_CM = 0.4;

export const STANDARD_SHEET_WIDTH_CM = 122;
export const STANDARD_SHEET_HEIGHT_CM = 244;

// ─── Score tuning ──────────────────────────────────────────────────────────────
// These stay small relative to the base `waste` term so best-fit-by-area remains
// the dominant signal — they only nudge close calls toward less fragmentation.
const MIN_USABLE_CM = 5;          // offcuts narrower than this on either side are basically scrap
const SLIVER_PENALTY_FACTOR = 2;   // multiplies a sliver leftover's area into the score
const FRAGMENTATION_FACTOR = 0.05; // small nudge favoring one big leftover over two mediums

const MAX_POST_OPT_PASSES = 5; // fixed-point iteration cap for sheet consolidation

// ─── Piece ordering heuristics ─────────────────────────────────────────────────
// Each produces an independent full packing using the exact same placement logic;
// the best result (fewest sheets, then utilization, then waste) is returned.
const HEURISTICS: { name: string; key: (p: CutPiece) => number }[] = [
  { name: "area-desc", key: (p) => -(p.width * p.height) },
  { name: "max-side-desc", key: (p) => -Math.max(p.width, p.height) },
  { name: "height-desc", key: (p) => -p.height },
  { name: "width-desc", key: (p) => -p.width },
  { name: "perimeter-desc", key: (p) => -2 * (p.width + p.height) },
];

// ─── Guillotine split ──────────────────────────────────────────────────────────
// Cuts a free rect into (at most) two new free rects after a piece is placed in
// its top-left corner, keeping whichever split leaves the larger single leftover
// piece — that leftover is what future panels get a shot at reusing. Shared by
// both the real placement step and the scorer (to preview a candidate's leftovers).
function computeGuillotineSplit(fr: FreeRect, placedW: number, placedH: number): FreeRect[] {
  const rightW = fr.w - placedW;
  const bottomH = fr.h - placedH;

  if (rightW > 0.01 && bottomH > 0.01) {
    const optionA: FreeRect[] = [
      { x: fr.x + placedW, y: fr.y, w: rightW, h: fr.h },
      { x: fr.x, y: fr.y + placedH, w: placedW, h: bottomH },
    ];
    const optionB: FreeRect[] = [
      { x: fr.x, y: fr.y + placedH, w: fr.w, h: bottomH },
      { x: fr.x + placedW, y: fr.y, w: rightW, h: placedH },
    ];
    const maxA = Math.max(optionA[0].w * optionA[0].h, optionA[1].w * optionA[1].h);
    const maxB = Math.max(optionB[0].w * optionB[0].h, optionB[1].w * optionB[1].h);
    return maxA >= maxB ? optionA : optionB;
  } else if (rightW > 0.01) {
    return [{ x: fr.x + placedW, y: fr.y, w: rightW, h: fr.h }];
  } else if (bottomH > 0.01) {
    return [{ x: fr.x, y: fr.y + placedH, w: fr.w, h: bottomH }];
  }
  return [];
}

// ─── Score ─────────────────────────────────────────────────────────────────────
// Base term is still plain best-fit-by-area (`waste`). On top of that, penalize
// leftover slivers (offcuts too narrow to ever cut anything real from) and, when
// a placement would split a rect into two comparable leftovers, nudge slightly
// toward whichever candidate keeps one large reusable leftover instead.
function scoreCandidate(fr: FreeRect, placedW: number, placedH: number): number {
  const waste = fr.w * fr.h - placedW * placedH;
  const leftovers = computeGuillotineSplit(fr, placedW, placedH);

  let sliverPenalty = 0;
  let bestLeftoverArea = 0;
  for (const lo of leftovers) {
    const isSliver = (lo.w > 0.01 && lo.w < MIN_USABLE_CM) || (lo.h > 0.01 && lo.h < MIN_USABLE_CM);
    if (isSliver) sliverPenalty += lo.w * lo.h * SLIVER_PENALTY_FACTOR;
    bestLeftoverArea = Math.max(bestLeftoverArea, lo.w * lo.h);
  }
  const fragmentationPenalty = leftovers.length === 2 ? (fr.w * fr.h - bestLeftoverArea) * FRAGMENTATION_FACTOR : 0;

  return waste + sliverPenalty + fragmentationPenalty;
}

// ─── Best-fit search ────────────────────────────────────────────────────────────
// Scans every free rect on sheets [0, sheetLimit) (both orientations) and returns
// the lowest-score fit, or null if the piece doesn't fit anywhere in that range.
// `debugCandidates`, when provided, collects every rect/orientation evaluated —
// used to explain why each option was or wasn't chosen.
function findBestPlacement(
  pw: number,
  ph: number,
  sheetFreeRects: FreeRect[][],
  sheetLimit: number,
  debugCandidates?: PackDebugCandidate[],
): { sheet: number; rect: number; rotated: boolean; score: number } | null {
  let best: { sheet: number; rect: number; rotated: boolean; score: number } | null = null;

  for (let s = 0; s < sheetLimit; s++) {
    const rects = sheetFreeRects[s];
    for (let r = 0; r < rects.length; r++) {
      const fr = rects[r];

      const fitsNormal = pw <= fr.w && ph <= fr.h;
      if (fitsNormal) {
        const score = scoreCandidate(fr, pw, ph);
        debugCandidates?.push({ sheet: s, rectIndex: r, rect: fr, rotated: false, score, chosen: false });
        if (!best || score < best.score) best = { sheet: s, rect: r, rotated: false, score };
      } else {
        debugCandidates?.push({ sheet: s, rectIndex: r, rect: fr, rotated: false, score: Infinity, chosen: false, rejectedReason: "no cabe sin rotar en este rectángulo" });
      }

      const fitsRotated = ph <= fr.w && pw <= fr.h;
      if (fitsRotated) {
        const score = scoreCandidate(fr, ph, pw);
        debugCandidates?.push({ sheet: s, rectIndex: r, rect: fr, rotated: true, score, chosen: false });
        if (!best || score < best.score) best = { sheet: s, rect: r, rotated: true, score };
      } else {
        debugCandidates?.push({ sheet: s, rectIndex: r, rect: fr, rotated: true, score: Infinity, chosen: false, rejectedReason: "no cabe rotada en este rectángulo" });
      }
    }
  }

  return best;
}

// ─── Single packing pass ────────────────────────────────────────────────────────
// The core greedy loop: for each piece (in the order given), find its best fit
// among already-opened sheets or open a new one, place it, and split the free
// rect it consumed. Identical logic to the original single-heuristic algorithm —
// now parameterized by piece order and reused by every heuristic + post-opt.
function runSinglePass(
  orderedPieces: CutPiece[],
  sheetWidth: number,
  sheetHeight: number,
  pieceDebugLog?: PackDebugPieceEntry[],
): { sheetFreeRects: FreeRect[][]; placements: CutPlacement[]; usedArea: number } {
  const sheetFreeRects: FreeRect[][] = [];
  const placements: CutPlacement[] = [];
  let usedArea = 0;

  for (const piece of orderedPieces) {
    const pw = piece.width + KERF_CM;
    const ph = piece.height + KERF_CM;
    usedArea += piece.width * piece.height;

    const debugCandidates: PackDebugCandidate[] | undefined = pieceDebugLog ? [] : undefined;
    let best = findBestPlacement(pw, ph, sheetFreeRects, sheetFreeRects.length, debugCandidates);

    if (!best) {
      sheetFreeRects.push([{ x: 0, y: 0, w: sheetWidth, h: sheetHeight }]);
      const fitsUnrotated = pw <= sheetWidth && ph <= sheetHeight;
      best = { sheet: sheetFreeRects.length - 1, rect: 0, rotated: !fitsUnrotated, score: 0 };
    }

    // Mark the debug trace before the free-rect list is mutated below.
    if (debugCandidates) {
      for (const c of debugCandidates) {
        if (c.sheet === best.sheet && c.rectIndex === best.rect && c.rotated === best.rotated) {
          c.chosen = true;
        } else if (!c.rejectedReason) {
          c.rejectedReason = "otra opción tuvo mejor score (menor desperdicio/fragmentación)";
        }
      }
    }

    const rects = sheetFreeRects[best.sheet];
    const chosenRect = rects[best.rect];
    const placedW = best.rotated ? ph : pw;
    const placedH = best.rotated ? pw : ph;

    pieceDebugLog?.push({
      piece: { width: piece.width, height: piece.height, label: piece.label },
      rotated: best.rotated,
      sheet: best.sheet,
      chosenRect: { ...chosenRect },
      candidates: debugCandidates ?? [],
    });

    rects.splice(best.rect, 1);
    placements.push({
      sheet: best.sheet,
      x: chosenRect.x,
      y: chosenRect.y,
      width: best.rotated ? piece.height : piece.width,
      height: best.rotated ? piece.width : piece.height,
      rotated: best.rotated,
      label: piece.label,
    });

    rects.push(...computeGuillotineSplit(chosenRect, placedW, placedH));
  }

  return { sheetFreeRects, placements, usedArea };
}

// ─── Post-optimization (sheet consolidation) ──────────────────────────────────
// Walks sheets from last to first; for each piece on the sheet being visited,
// tries the SAME best-fit search restricted to earlier sheets only. If it fits,
// the piece is moved there (placed via the same guillotine split used everywhere
// else) and dropped from its original sheet.
//
// Note on the free-rect model: guillotine free-rect tracking only records *free*
// space, so moving a piece away from its sheet must give that space back as a new
// free rect on the source sheet (exactly the footprint it vacated, kerf included) —
// otherwise that sheet's occupied+free accounting would no longer add up to its
// total area. This doesn't try to merge the freed rect with its neighbors (that
// "undo a guillotine split" problem is what this whole approach avoids); it's just
// added as its own disjoint free rect, which a later pass may reuse. This can only
// reduce or match the sheet count, never increase it. Sheets left with zero pieces
// after all moves are dropped entirely, and `placements[].sheet` is remapped to
// stay contiguous (0..N-1) so downstream consumers (the cut-diagram builder) keep working.
function postOptimize(
  sheetFreeRects: FreeRect[][],
  placements: CutPlacement[],
  sheetWidth: number,
  sheetHeight: number,
  moveLog?: PackDebugMove[],
): void {
  let movedAny = true;
  let pass = 0;

  while (movedAny && pass < MAX_POST_OPT_PASSES) {
    movedAny = false;
    pass++;

    for (let s = sheetFreeRects.length - 1; s >= 1; s--) {
      const onThisSheet = placements.filter((p) => p.sheet === s);

      for (const placement of onThisSheet) {
        const originalWidth = placement.rotated ? placement.height : placement.width;
        const originalHeight = placement.rotated ? placement.width : placement.height;
        const pw = originalWidth + KERF_CM;
        const ph = originalHeight + KERF_CM;

        const best = findBestPlacement(pw, ph, sheetFreeRects, s); // only sheets before this one
        if (!best) continue;

        const rects = sheetFreeRects[best.sheet];
        const chosenRect = rects[best.rect];
        const placedW = best.rotated ? ph : pw;
        const placedH = best.rotated ? pw : ph;

        rects.splice(best.rect, 1);
        rects.push(...computeGuillotineSplit(chosenRect, placedW, placedH));

        // Give back the exact footprint (kerf included) this piece vacated on its
        // source sheet, so that sheet's occupied+free area still adds up.
        const fromSheet = placement.sheet;
        sheetFreeRects[fromSheet].push({
          x: placement.x,
          y: placement.y,
          w: placement.width + KERF_CM,
          h: placement.height + KERF_CM,
        });

        placement.sheet = best.sheet;
        placement.x = chosenRect.x;
        placement.y = chosenRect.y;
        placement.rotated = best.rotated;
        placement.width = best.rotated ? originalHeight : originalWidth;
        placement.height = best.rotated ? originalWidth : originalHeight;

        moveLog?.push({ label: placement.label, fromSheet, toSheet: best.sheet });
        movedAny = true;
      }
    }
  }

  // Drop sheets left with no pieces and remap indices to stay contiguous.
  const occupiedSheets = Array.from(new Set(placements.map((p) => p.sheet))).sort((a, b) => a - b);
  const remap = new Map<number, number>();
  occupiedSheets.forEach((oldIdx, newIdx) => remap.set(oldIdx, newIdx));
  for (const p of placements) p.sheet = remap.get(p.sheet)!;

  const compacted = occupiedSheets.map((oldIdx) => sheetFreeRects[oldIdx]);
  sheetFreeRects.length = 0;
  sheetFreeRects.push(...compacted);

  // sheetWidth/sheetHeight aren't needed by this function's own logic (the
  // consolidation only reuses already-computed free rects) — kept as parameters
  // for symmetry with runSinglePass/findBestPlacement and possible future use.
  void sheetWidth;
  void sheetHeight;
}

// ─── Validation (debug mode only) ──────────────────────────────────────────────
// Sanity-checks the final packing so a bug in the placement/split logic would
// throw loudly instead of silently producing a wrong cut diagram.
function validatePacking(sheetFreeRects: FreeRect[][], placements: CutPlacement[], sheetWidth: number, sheetHeight: number): void {
  const EPS = 0.05;       // cm tolerance for floating point drift
  const AREA_EPS_CM2 = 1; // cm² tolerance — splits conserve area exactly, so this only needs to absorb float noise

  // 1. No piece placed outside its sheet's bounds.
  for (const p of placements) {
    if (p.x < -EPS || p.y < -EPS || p.x + p.width > sheetWidth + EPS || p.y + p.height > sheetHeight + EPS) {
      throw new Error(`[sheetPacking debug] Pieza fuera de los límites de la hoja ${p.sheet}: ${JSON.stringify(p)}`);
    }
  }

  // 2. No two pieces on the same sheet overlap (checked against their kerf-inflated footprint).
  const bySheet = new Map<number, CutPlacement[]>();
  for (const p of placements) {
    const list = bySheet.get(p.sheet) ?? [];
    list.push(p);
    bySheet.set(p.sheet, list);
  }
  for (const [sheet, list] of bySheet) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const aw = a.width + KERF_CM, ah = a.height + KERF_CM;
        const bw = b.width + KERF_CM, bh = b.height + KERF_CM;
        const disjoint = a.x + aw <= b.x + EPS || b.x + bw <= a.x + EPS || a.y + ah <= b.y + EPS || b.y + bh <= a.y + EPS;
        if (!disjoint) {
          throw new Error(`[sheetPacking debug] Piezas traslapadas en hoja ${sheet}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
        }
      }
    }
  }

  // 3. Occupied area + free area must equal the sheet's total area (guillotine splits conserve area exactly).
  const sheetArea = sheetWidth * sheetHeight;
  for (let s = 0; s < sheetFreeRects.length; s++) {
    const occupied = (bySheet.get(s) ?? []).reduce((sum, p) => sum + (p.width + KERF_CM) * (p.height + KERF_CM), 0);
    const free = sheetFreeRects[s].reduce((sum, r) => sum + r.w * r.h, 0);
    if (Math.abs(occupied + free - sheetArea) > AREA_EPS_CM2) {
      throw new Error(`[sheetPacking debug] El área de la hoja ${s} no cuadra: ocupada=${occupied.toFixed(2)} + libre=${free.toFixed(2)} ≠ total=${sheetArea}`);
    }
  }

  // 4 & 5. No free rect fully contains another, and no duplicate free rects, per sheet.
  for (let s = 0; s < sheetFreeRects.length; s++) {
    const rects = sheetFreeRects[s];
    for (let i = 0; i < rects.length; i++) {
      for (let j = 0; j < rects.length; j++) {
        if (i === j) continue;
        const a = rects[i], b = rects[j];
        const sameRect = Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.w - b.w) < EPS && Math.abs(a.h - b.h) < EPS;
        if (sameRect) {
          throw new Error(`[sheetPacking debug] Rectángulos libres duplicados en hoja ${s}: ${JSON.stringify(a)}`);
        }
        const aContainsB = a.x <= b.x + EPS && a.y <= b.y + EPS && a.x + a.w >= b.x + b.w - EPS && a.y + a.h >= b.y + b.h - EPS;
        if (aContainsB) {
          throw new Error(`[sheetPacking debug] Rectángulo libre redundante en hoja ${s}: ${JSON.stringify(b)} está contenido en ${JSON.stringify(a)}`);
        }
      }
    }
  }
}

function computeResultMetrics(sheetCount: number, usedArea: number, sheetWidth: number, sheetHeight: number) {
  const boughtAreaCm2 = sheetCount * sheetWidth * sheetHeight;
  const utilizationPct = boughtAreaCm2 > 0 ? (usedArea / boughtAreaCm2) * 100 : 0;
  const wasteCm2 = boughtAreaCm2 - usedArea;
  return { boughtAreaCm2, utilizationPct, wasteCm2 };
}

// ─── Public entry point ─────────────────────────────────────────────────────────
export function packSheets(
  pieces: CutPiece[],
  sheetWidth = STANDARD_SHEET_WIDTH_CM,
  sheetHeight = STANDARD_SHEET_HEIGHT_CM,
  debug = false,
): PackResult {
  if (pieces.length === 0) {
    return { sheets: 0, pieceCount: 0, usedAreaCm2: 0, boughtAreaCm2: 0, utilizationPct: 0, placements: [] };
  }

  // Run every heuristic ordering through the exact same pack + consolidate logic,
  // then keep whichever result used the fewest sheets (ties broken by utilization,
  // then waste — the last two are almost always equal at a fixed sheet count).
  const candidates = HEURISTICS.map(({ name, key }) => {
    const ordered = [...pieces].sort((a, b) => key(a) - key(b));
    const { sheetFreeRects, placements, usedArea } = runSinglePass(ordered, sheetWidth, sheetHeight);
    postOptimize(sheetFreeRects, placements, sheetWidth, sheetHeight);
    return { strategy: name, sheetFreeRects, placements, usedArea };
  });

  candidates.sort((a, b) => {
    if (a.sheetFreeRects.length !== b.sheetFreeRects.length) return a.sheetFreeRects.length - b.sheetFreeRects.length;
    const ma = computeResultMetrics(a.sheetFreeRects.length, a.usedArea, sheetWidth, sheetHeight);
    const mb = computeResultMetrics(b.sheetFreeRects.length, b.usedArea, sheetWidth, sheetHeight);
    if (mb.utilizationPct !== ma.utilizationPct) return mb.utilizationPct - ma.utilizationPct;
    return ma.wasteCm2 - mb.wasteCm2;
  });

  const winner = candidates[0];
  const sheets = winner.sheetFreeRects.length;
  const { boughtAreaCm2, utilizationPct } = computeResultMetrics(sheets, winner.usedArea, sheetWidth, sheetHeight);

  const result: PackResult = {
    sheets,
    pieceCount: pieces.length,
    usedAreaCm2: winner.usedArea,
    boughtAreaCm2,
    utilizationPct,
    placements: winner.placements,
  };

  if (debug) {
    // Re-run just the winning order, this time with instrumentation attached —
    // keeps the normal (non-debug) path free of any logging overhead. Deterministic,
    // so this reproduces the exact same packing as `winner` above.
    const winningHeuristic = HEURISTICS.find((h) => h.name === winner.strategy)!;
    const ordered = [...pieces].sort((a, b) => winningHeuristic.key(a) - winningHeuristic.key(b));
    const pieceLog: PackDebugPieceEntry[] = [];
    const { sheetFreeRects: debugFreeRects, placements: debugPlacements } = runSinglePass(ordered, sheetWidth, sheetHeight, pieceLog);
    const moveLog: PackDebugMove[] = [];
    postOptimize(debugFreeRects, debugPlacements, sheetWidth, sheetHeight, moveLog);

    validatePacking(debugFreeRects, debugPlacements, sheetWidth, sheetHeight);

    const sheetArea = sheetWidth * sheetHeight;
    const sheetSummaries: PackDebugSheetSummary[] = debugFreeRects.map((rects, s) => {
      const freeAreaCm2 = rects.reduce((sum, r) => sum + r.w * r.h, 0);
      const usedAreaCm2 = sheetArea - freeAreaCm2;
      const largestFreeRect = rects.reduce<FreeRect | null>((max, r) => (!max || r.w * r.h > max.w * max.h ? r : max), null);
      return { sheet: s, freeRects: rects, usedAreaCm2, freeAreaCm2, largestFreeRect, utilizationPct: (usedAreaCm2 / sheetArea) * 100 };
    });

    const heuristicComparison: PackDebugHeuristicResult[] = candidates.map((c) => {
      const m = computeResultMetrics(c.sheetFreeRects.length, c.usedArea, sheetWidth, sheetHeight);
      return { strategy: c.strategy, sheets: c.sheetFreeRects.length, utilizationPct: m.utilizationPct, wasteCm2: m.wasteCm2 };
    });

    result.debugLog = {
      strategy: winner.strategy,
      pieces: pieceLog,
      sheets: sheetSummaries,
      postOptimizationMoves: moveLog,
      heuristicComparison,
    };

    /* eslint-disable no-console */
    console.log(`[sheetPacking] estrategia ganadora: "${winner.strategy}" · ${sheets} hoja(s) · ${utilizationPct.toFixed(1)}% aprovechamiento`);
    console.table(heuristicComparison);
    console.table(
      sheetSummaries.map((s) => ({
        hoja: s.sheet,
        "usada (cm²)": s.usedAreaCm2.toFixed(0),
        "libre (cm²)": s.freeAreaCm2.toFixed(0),
        "rect. libre mayor": s.largestFreeRect ? `${s.largestFreeRect.w.toFixed(0)}×${s.largestFreeRect.h.toFixed(0)}` : "—",
        aprovechamiento: `${s.utilizationPct.toFixed(1)}%`,
      })),
    );
    if (moveLog.length > 0) console.table(moveLog);
    /* eslint-enable no-console */
  }

  return result;
}
