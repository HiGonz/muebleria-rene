import { Card } from "@/components/ui/card";

export function DimensionsPanel({
  height,
  width,
  depth,
  shelves,
  doors,
}: {
  height: number;
  width: number;
  depth: number;
  shelves: number;
  doors: number;
}) {
  const rows = [
    ["Alto", `${height} cm`],
    ["Ancho", `${width} cm`],
    ["Fondo", `${depth} cm`],
    ["Repisas", `${shelves}`],
    ["Puertas", `${doors}`],
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
