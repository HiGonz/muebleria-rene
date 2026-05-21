import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  title,
  value,
  change,
  icon: Icon,
  accent = "indigo",
  helper,
}: {
  title: string;
  value: number | string;
  change: number;
  icon: LucideIcon;
  accent?: "indigo" | "emerald";
  helper?: string;
}) {
  const formattedValue = typeof value === "number" && title.toLowerCase().includes("ventas") ? formatCurrency(value) : value;
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">{title}</p>
          <h3 className="mt-2 text-3xl font-semibold">{formattedValue}</h3>
        </div>
        <div className={`rounded-2xl p-3 ${accent === "indigo" ? "bg-indigo-500/15 text-indigo-200" : "bg-emerald-500/15 text-emerald-200"}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Badge tone={change >= 0 ? "emerald" : "rose"}>{change >= 0 ? "+" : ""}{change}% vs mes anterior</Badge>
        {helper && <span className="text-sm text-zinc-500">{helper}</span>}
      </div>
    </Card>
  );
}
