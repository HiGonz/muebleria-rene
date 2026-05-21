import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { listMaterials } from "@/services/api";

export default async function MaterialsPage() {
  const materials = await listMaterials();
  return (
    <AppShell title="Materiales" subtitle="Catálogo de tableros, herrajes y fijación">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">CRUD de materiales</h3>
            <p className="text-sm text-zinc-400">Vista lista para alta, edición y activación de catálogo.</p>
          </div>
          <Button>Nuevo material</Button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>{['Nombre', 'Tipo', 'Unidad', 'Costo unitario', 'Stock', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id} className="border-t border-white/6">
                  <td className="px-4 py-4 font-medium text-white">{material.name}</td>
                  <td className="px-4 py-4"><Badge tone={material.type === 'Tablero' ? 'indigo' : material.type === 'Herraje' ? 'amber' : 'emerald'}>{material.type}</Badge></td>
                  <td className="px-4 py-4 text-zinc-400">{material.unit}</td>
                  <td className="px-4 py-4 text-zinc-400">{formatCurrency(material.cost)}</td>
                  <td className="px-4 py-4 text-zinc-400">{material.stock}</td>
                  <td className="px-4 py-4"><Badge tone={material.active ? 'emerald' : 'rose'}>{material.active ? 'Activo' : 'Inactivo'}</Badge></td>
                  <td className="px-4 py-4"><div className="flex gap-2"><Button variant="secondary" className="h-9">Editar</Button><Button variant="ghost" className="h-9">Toggle</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
