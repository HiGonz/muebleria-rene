// Small stable palette so each cut-diagram part keeps the same color across
// sheets, renders, and the printed PDF report.
const PART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444", "#84cc16", "#3b82f6", "#f97316"];

export function partColor(part: string): string {
  let hash = 0;
  for (let i = 0; i < part.length; i++) hash = (hash * 31 + part.charCodeAt(i)) >>> 0;
  return PART_COLORS[hash % PART_COLORS.length];
}
