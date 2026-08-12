// ─── 1D Cutting Stock Problem solver (countertop stock pieces) ────────────────
// Given a list of required countertop segment lengths (feet) that all share the
// same material/price, decides which commercial stock pieces to buy — and which
// segments to cut from which piece — minimizing, in strict priority order:
//   1. total cost (∝ total footage bought, since price/ft is constant within a
//      material group — a stock piece's own price is simply length × price/ft)
//   2. number of stock pieces bought
//   3. total trim waste
// Segments CAN be combined onto the same physical stock piece regardless of
// which wall they came from — that cross-segment packing is what actually makes
// this a cutting-stock problem rather than the old "round each run up to its own
// nearest stock length" approach. A segment longer than the largest stock length
// can't be cut from a single piece at all — callers must splice those separately
// (see splicedCover below) before handing the rest to solveCuttingStock.

export const STOCK_LENGTHS_FT = [4, 6, 8, 10, 12];

// Below this many segments, an exact Branch & Bound search runs (seeded with a
// Best-Fit-Decreasing solution as both a starting incumbent and a safety net).
// At or above it, B&B's search space grows too fast for a synchronous
// in-browser computation, so only the BFD heuristic runs.
export const EXACT_SOLVER_SEGMENT_THRESHOLD = 25;

// Caps how much searching the exact solver does, in nodes visited and
// wall-clock time — a defensive backstop against adversarial inputs the
// segment-count threshold alone doesn't rule out. Hitting either cap just means
// the search stops improving on its BFD-seeded incumbent, which is always a
// valid, feasible answer on its own.
const NODE_BUDGET = 200_000;
const TIME_BUDGET_MS = 1500;

const EPS = 1e-6;

export interface CutSegment {
  label: string; // e.g. "Norte", "Sur (2)", "Isla" — shown in the piece breakdown
  lengthFt: number;
}

export interface StockPiece {
  length: number; // ft, one of STOCK_LENGTHS_FT
  segments: CutSegment[]; // which required segments this piece was cut into
  usedFt: number;
  wasteFt: number;
}

export interface CuttingStockResult {
  pieces: StockPiece[];
  totalCost: number;
  pieceCount: number;
  totalWasteFt: number;
  utilizationPct: number;
  strategy: "exact" | "best-fit-decreasing";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Bin-packing core types ─────────────────────────────────────────────────
// A "bin" here is one physical stock piece being filled with segments during
// the search — segIndices reference positions in the (locally sorted) segment-
// length array the search is currently running over, not the caller's array.
interface BinState {
  length: number;
  used: number;
  segIndices: number[];
}

function cloneBins(bins: BinState[]): BinState[] {
  return bins.map((b) => ({ length: b.length, used: b.used, segIndices: [...b.segIndices] }));
}

function binsCost(bins: BinState[]): number {
  return bins.reduce((sum, b) => sum + b.length, 0);
}

// ─── Best-Fit-Decreasing heuristic ──────────────────────────────────────────
// Largest segment first; each goes into whichever already-open bin leaves the
// least leftover room (and still fits), or — if none fits — a brand-new bin
// using the smallest stock length that can hold it. Used both as the fallback
// strategy for large segment counts and as the exact solver's starting
// incumbent (so the exact search only ever does as well or better).
function bestFitDecreasing(lengths: number[], stockLengthsAsc: number[]): BinState[] {
  const order = lengths.map((_, i) => i).sort((a, b) => lengths[b] - lengths[a]);
  const bins: BinState[] = [];
  for (const i of order) {
    const v = lengths[i];
    let best: BinState | null = null;
    let bestLeftover = Infinity;
    for (const b of bins) {
      const remaining = b.length - b.used;
      if (remaining + EPS < v) continue;
      const leftover = remaining - v;
      if (leftover < bestLeftover) {
        best = b;
        bestLeftover = leftover;
      }
    }
    if (best) {
      best.used += v;
      best.segIndices.push(i);
    } else {
      const stockLen = stockLengthsAsc.find((l) => l + EPS >= v);
      if (stockLen === undefined) {
        throw new Error(`El segmento de ${v.toFixed(2)}' excede la longitud máxima de stock disponible.`);
      }
      bins.push({ length: stockLen, used: v, segIndices: [i] });
    }
  }
  return bins;
}

// ─── Exact Branch & Bound ───────────────────────────────────────────────────
// Segments are processed in a FIXED longest-first order (a pruning aid only —
// it never decides the final assignment, since every branch below still
// considers every open bin and every stock length for the current segment).
// At each segment: try placing it in each distinct already-open bin it fits in
// (bins with identical remaining capacity are deduplicated — trying both is a
// symmetric, wasted branch), or opening one new bin per distinct stock length
// that can hold it. A simple but valid lower bound (remaining demand minus
// remaining open capacity, added to the cost already committed) prunes any
// branch that can't beat the current best.
function branchAndBound(
  sortedLengths: number[],
  stockLengthsAsc: number[],
  incumbent: { bins: BinState[]; cost: number; pieceCount: number },
): { bins: BinState[]; cost: number; pieceCount: number } {
  const n = sortedLengths.length;
  // Suffix sums of remaining demand, for the lower-bound check.
  const suffixDemand = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixDemand[i] = suffixDemand[i + 1] + sortedLengths[i];

  let best = { bins: cloneBins(incumbent.bins), cost: incumbent.cost, pieceCount: incumbent.pieceCount };
  let nodes = 0;
  const startTime = Date.now();
  let aborted = false;

  const bins: BinState[] = [];

  function search(idx: number, currentCost: number) {
    if (aborted) return;
    nodes++;
    if (nodes > NODE_BUDGET || (nodes % 2000 === 0 && Date.now() - startTime > TIME_BUDGET_MS)) {
      aborted = true;
      return;
    }

    if (idx === n) {
      const pieceCount = bins.length;
      if (currentCost < best.cost - EPS || (Math.abs(currentCost - best.cost) < EPS && pieceCount < best.pieceCount)) {
        best = { bins: cloneBins(bins), cost: currentCost, pieceCount };
      }
      return;
    }

    const availableCapacity = bins.reduce((sum, b) => sum + (b.length - b.used), 0);
    const extraNeeded = Math.max(0, suffixDemand[idx] - availableCapacity);
    const lowerBoundCost = currentCost + extraNeeded;
    if (lowerBoundCost > best.cost + EPS) return;
    if (Math.abs(lowerBoundCost - best.cost) < EPS && bins.length >= best.pieceCount) return;

    const v = sortedLengths[idx];

    const triedCapacities = new Set<string>();
    for (const b of bins) {
      const remaining = b.length - b.used;
      if (remaining + EPS < v) continue;
      const key = `${b.length}|${remaining.toFixed(4)}`;
      if (triedCapacities.has(key)) continue;
      triedCapacities.add(key);
      b.used += v;
      b.segIndices.push(idx);
      search(idx + 1, currentCost);
      b.used -= v;
      b.segIndices.pop();
      if (aborted) return;
    }

    for (const L of stockLengthsAsc) {
      if (L + EPS < v) continue;
      bins.push({ length: L, used: v, segIndices: [idx] });
      search(idx + 1, currentCost + L);
      bins.pop();
      if (aborted) return;
    }
  }

  search(0, 0);
  return best;
}

// ─── Public entry point ─────────────────────────────────────────────────────
export function solveCuttingStock(segments: CutSegment[], pricePerFt: number): CuttingStockResult {
  const valid = segments.filter((s) => s.lengthFt > EPS);
  if (valid.length === 0) {
    return { pieces: [], totalCost: 0, pieceCount: 0, totalWasteFt: 0, utilizationPct: 0, strategy: "exact" };
  }

  const maxStock = Math.max(...STOCK_LENGTHS_FT);
  const oversized = valid.find((s) => s.lengthFt > maxStock + EPS);
  if (oversized) {
    throw new Error(
      `El segmento "${oversized.label}" (${oversized.lengthFt.toFixed(2)}') excede la longitud máxima de stock (${maxStock}'); debe dividirse con splicedCover antes de llamar a solveCuttingStock.`,
    );
  }

  const stockAsc = [...STOCK_LENGTHS_FT].sort((a, b) => a - b);
  const lengths = valid.map((s) => s.lengthFt);
  // Search runs over a longest-first-sorted copy (pruning aid) — `order[k]`
  // is the index into `valid`/`lengths` that sorted position k came from, used
  // once at the end to translate the winning bins back to the caller's indices.
  const order = lengths.map((_, i) => i).sort((a, b) => lengths[b] - lengths[a]);
  const sortedLengths = order.map((i) => lengths[i]);

  const bfdBins = bestFitDecreasing(sortedLengths, stockAsc);
  const incumbent = { bins: bfdBins, cost: binsCost(bfdBins), pieceCount: bfdBins.length };

  let winner = incumbent;
  let strategy: "exact" | "best-fit-decreasing" = "best-fit-decreasing";
  if (valid.length < EXACT_SOLVER_SEGMENT_THRESHOLD) {
    winner = branchAndBound(sortedLengths, stockAsc, incumbent);
    strategy = "exact";
  }

  const pieces: StockPiece[] = winner.bins.map((b) => {
    const segs = b.segIndices.map((k) => valid[order[k]]);
    const usedFt = segs.reduce((sum, s) => sum + s.lengthFt, 0);
    return { length: b.length, segments: segs, usedFt, wasteFt: round(b.length - usedFt) };
  });

  const boughtFt = pieces.reduce((sum, p) => sum + p.length, 0);
  const usedFt = pieces.reduce((sum, p) => sum + p.usedFt, 0);

  return {
    pieces,
    totalCost: round(boughtFt * pricePerFt),
    pieceCount: pieces.length,
    totalWasteFt: round(boughtFt - usedFt),
    utilizationPct: boughtFt > 0 ? (usedFt / boughtFt) * 100 : 0,
    strategy,
  };
}

// ─── Oversized single-segment splicing ──────────────────────────────────────
// A run longer than the largest stock length (12') can't be cut from one
// piece at all — it has to be spliced from several, joined end to end. That's
// a fundamentally different problem from the shared bin-packing above (the
// pieces here are fully consumed by this one run; there's no leftover left to
// share with other segments), so it's kept separate: cheapest total footage
// that covers the run (unbounded coin-change DP over the stock lengths),
// tie-broken toward fewer pieces. Rare in practice — a 12'+ continuous
// countertop run — but has to be handled since solveCuttingStock rejects it.
export function splicedCover(
  lengthFt: number,
  pricePerFt: number,
  runLabel: string,
  stockLengths: number[] = STOCK_LENGTHS_FT,
): CuttingStockResult {
  const target = Math.ceil(lengthFt - EPS);
  const maxLen = Math.max(...stockLengths);
  const maxSum = target + maxLen;
  const minPieces = new Array(maxSum + 1).fill(Infinity);
  const usedLength = new Array(maxSum + 1).fill(0);
  minPieces[0] = 0;
  for (let s = 1; s <= maxSum; s++) {
    for (const len of stockLengths) {
      if (len <= s && minPieces[s - len] + 1 < minPieces[s]) {
        minPieces[s] = minPieces[s - len] + 1;
        usedLength[s] = len;
      }
    }
  }
  let totalFt = Math.max(target, 0);
  while (totalFt <= maxSum && !Number.isFinite(minPieces[totalFt])) totalFt++;

  const lengthsUsed: number[] = [];
  let remaining = totalFt;
  while (remaining > 0) {
    const len = usedLength[remaining];
    lengthsUsed.push(len);
    remaining -= len;
  }
  // Largest piece absorbs the run's actual length first — the rest are pure
  // splice pieces, entirely waste apart from the trim needed at the joint.
  lengthsUsed.sort((a, b) => b - a);
  let coveredSoFar = 0;
  const pieces: StockPiece[] = lengthsUsed.map((len, i) => {
    const remainingRun = Math.max(0, lengthFt - coveredSoFar);
    const usedFt = round(Math.min(len, remainingRun));
    coveredSoFar += usedFt;
    return {
      length: len,
      segments: [{ label: `${runLabel} (empalme ${i + 1}/${lengthsUsed.length})`, lengthFt: usedFt }],
      usedFt,
      wasteFt: round(len - usedFt),
    };
  });

  const boughtFt = pieces.reduce((sum, p) => sum + p.length, 0);
  return {
    pieces,
    totalCost: round(boughtFt * pricePerFt),
    pieceCount: pieces.length,
    totalWasteFt: round(boughtFt - lengthFt),
    utilizationPct: boughtFt > 0 ? (lengthFt / boughtFt) * 100 : 0,
    strategy: "exact",
  };
}
