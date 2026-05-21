"use client";

import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { MaterialItem } from "@/services/materialCalculator";

export function MaterialsTable({ items, onChange }: { items: MaterialItem[]; onChange: (index: number, quantity: number) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white/5 text-zinc-400">
          <tr>
            {['Material', 'Descripción', 'Cant.', 'Unid.', 'P.Unit.', 'Total'].map((head) => <th key={head} className="px-4 py-3 font-medium">{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.material}-${index}`} className="border-t border-white/6">
              <td className="px-4 py-3 font-medium text-white">{item.material}</td>
              <td className="px-4 py-3 text-zinc-400">{item.description}</td>
              <td className="px-4 py-3 w-28">
                <Input type="number" step="0.1" value={item.quantity} onChange={(e) => onChange(index, Number(e.target.value))} className="h-10" />
              </td>
              <td className="px-4 py-3 text-zinc-400">{item.unit}</td>
              <td className="px-4 py-3 text-zinc-400">{formatCurrency(item.unitCost)}</td>
              <td className="px-4 py-3 font-semibold text-white">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
