"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { deleteMaterial, listMaterials, updateMaterial } from "@/services/api";
import { MaterialFormModal } from "@/components/materials/MaterialFormModal";
import { BOARD_COSTS } from "@/services/kitchenData";
import { useRoleGuard, PAGE_ROLES } from "@/lib/roleAccess";

type MaterialRow = Awaited<ReturnType<typeof listMaterials>>[number];

export default function MaterialsPage() {
  useRoleGuard(PAGE_ROLES["/materials"]);
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null);
  const [editing, setEditing] = useState<MaterialRow | "new" | null>(null);

  const reload = () => listMaterials().then(setMaterials);

  useEffect(() => {
    reload();
  }, []);

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const handleToggle = async (material: MaterialRow) => {
    await updateMaterial(material.id, { active: !material.active });
    reload();
  };

  const handleSetDefault = async (material: MaterialRow, band: "defaultFloor" | "defaultWall") => {
    if (!(material.name in BOARD_COSTS)) {
      window.alert(`"${material.name}" no coincide con ningún tipo de tablero reconocido. Solo un material cuyo nombre coincida exactamente con un tipo de tablero existente (ej. "MDF 18mm", "Melamina blanca 15mm") puede ser el predeterminado.`);
      return;
    }
    await updateMaterial(material.id, { [band]: true });
    reload();
  };

  const handleDelete = async (material: MaterialRow) => {
    if (!window.confirm(`¿Eliminar "${material.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteMaterial(material.id);
    reload();
  };

  return (
    <AppShell title="Materiales" subtitle="Catálogo de tableros, herrajes y fijación">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">CRUD de materiales</h3>
            <p className="text-sm text-zinc-400">Vista lista para alta, edición y activación de catálogo.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo material</Button>
        </div>
        {!materials ? (
          <p className="text-sm text-zinc-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
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
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(material)}>Editar</Button>
                        <Button variant="ghost" className="h-9" onClick={() => handleToggle(material)}>{material.active ? "Desactivar" : "Activar"}</Button>
                        <Button variant="danger" className="h-9" onClick={() => handleDelete(material)}>Eliminar</Button>
                        {material.type === "Tablero" && (
                          material.defaultFloor
                            ? <Badge tone="indigo">Predeterminado piso</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetDefault(material, "defaultFloor")}>Predeterminado piso</Button>
                        )}
                        {material.type === "Tablero" && (
                          material.defaultWall
                            ? <Badge tone="indigo">Predeterminado pared</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetDefault(material, "defaultWall")}>Predeterminado pared</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <MaterialFormModal
          material={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}
