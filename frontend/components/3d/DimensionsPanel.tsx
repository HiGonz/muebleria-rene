import { Card } from "@/components/ui/card";
import type { FurnitureType } from "@/services/materialCalculator";

export function DimensionsPanel({
  type,
  height,
  width,
  depth,
  shelves,
  doors,
}: {
  type?: FurnitureType;
  height: number;
  width: number;
  depth: number;
  shelves: number;
  doors: number;
}) {
  const isKitchen = type === "Cocina";
  const rows = [
    ["Alto", `${height} cm`],
    ["Ancho", `${width} cm`],
    ["Fondo", `${depth} cm`],
    [isKitchen ? "P. altas" : "Repisas", `${shelves}`],
    [isKitchen ? "P. bajas" : "Puertas", `${doors}`],
  ];

  return (
    <Card className="absolute left-4 top-4 z-10 w-44 rounded-2xl p-4">
      <p className="mb-3 text-xs uppercase tracking-[0.25em] text-zinc-400">Medidas</p>
      <div className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-zinc-300">
            <span>{label}</span>
            <span className="font-medium text-white">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
