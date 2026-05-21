import { cn } from "@/lib/utils";

const toneMap = {
  indigo: "bg-indigo-500/15 text-indigo-200 border-indigo-400/20",
  emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  rose: "bg-rose-500/15 text-rose-200 border-rose-400/20",
  amber: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  zinc: "bg-white/8 text-zinc-200 border-white/10",
} as const;

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: keyof typeof toneMap }) {
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", toneMap[tone])}>{children}</span>;
}
