"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export function QuoteSummary({
  status,
  subtotalMaterials,
  laborPercentage,
  profitPercentage,
  laborCost,
  profitCost,
  total,
  onLaborChange,
  onProfitChange,
  onGeneratePdf,
}: {
  status: string;
  subtotalMaterials: number;
  laborPercentage: number;
  profitPercentage: number;
  laborCost: number;
  profitCost: number;
  total: number;
  onLaborChange: (value: number) => void;
  onProfitChange: (value: number) => void;
  onGeneratePdf: () => void;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">Resumen financiero</p>
          <h3 className="mt-1 text-2xl font-semibold">{formatCurrency(total)}</h3>
        </div>
        <Badge tone={status === 'Aprobada' ? 'emerald' : status === 'Enviada' ? 'amber' : status === 'Rechazada' ? 'rose' : 'zinc'}>{status}</Badge>
      </div>
      <div className="space-y-3 text-sm text-zinc-300">
        <div className="flex justify-between"><span>Subtotal materiales</span><span>{formatCurrency(subtotalMaterials)}</span></div>
        <div className="space-y-2">
          <div className="flex justify-between"><span>Mano de obra ({laborPercentage}%)</span><span>{formatCurrency(laborCost)}</span></div>
          <input type="range" min={10} max={50} value={laborPercentage} onChange={(e) => onLaborChange(Number(e.target.value))} className="w-full accent-indigo-400" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between"><span>Utilidad ({profitPercentage}%)</span><span>{formatCurrency(profitCost)}</span></div>
          <input type="range" min={10} max={40} value={profitPercentage} onChange={(e) => onProfitChange(Number(e.target.value))} className="w-full accent-emerald-400" />
        </div>
      </div>
      <div className="border-t border-white/10 pt-4 text-2xl font-semibold">TOTAL: {formatCurrency(total)}</div>
      <div className="grid gap-3">
        <Button onClick={onGeneratePdf}>Generar PDF</Button>
        <Button variant="secondary">Marcar como enviada</Button>
      </div>
    </Card>
  );
}
