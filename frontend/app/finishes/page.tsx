"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteFinish, listFinishes, updateFinish, type Finish } from "@/services/api";
import { FinishFormModal } from "@/components/finishes/FinishFormModal";
import { useRoleGuard, PAGE_ROLES } from "@/lib/roleAccess";

export default function FinishesPage() {
  useRoleGuard(PAGE_ROLES["/finishes"]);
  const [finishes, setFinishes] = useState<Finish[] | null>(null);
  const [editing, setEditing] = useState<Finish | "new" | null>(null);

  const reload = () => listFinishes().then(setFinishes);

  useEffect(() => {
    reload();
  }, []);

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const handleToggle = async (finish: Finish) => {
    await updateFinish(finish.id, { active: !finish.active });
    reload();
  };

  const handleDelete = async (finish: Finish) => {
    if (!window.confirm(`¿Eliminar "${finish.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteFinish(finish.id);
    reload();
  };

  return (
    <AppShell title="Acabados / Texturas" subtitle="Catálogo fotográfico de acabados para paneles y cubiertas">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">CRUD de acabados</h3>
            <p className="text-sm text-zinc-400">Sube una foto y se convierte automáticamente en textura tileable.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo acabado</Button>
        </div>
        {!finishes ? (
          <p className="text-sm text-zinc-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-zinc-400">
                <tr>{['', 'Nombre', 'Código', 'Aplica a', 'Costo extra/m²', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
              </thead>
              <tbody>
                {finishes.map((finish) => (
                  <tr key={finish.id} className="border-t border-white/6">
                    <td className="px-4 py-4">
                      <img src={finish.textureUrl} alt="" className="h-10 w-10 rounded-lg border border-white/10 object-cover" />
                    </td>
                    <td className="px-4 py-4 font-medium text-white">{finish.name}</td>
                    <td className="px-4 py-4 font-mono text-xs text-zinc-400">{finish.code}</td>
                    <td className="px-4 py-4"><Badge tone={finish.type === 'panel' ? 'indigo' : finish.type === 'cubierta' ? 'amber' : 'emerald'}>{finish.type}</Badge></td>
                    <td className="px-4 py-4 text-zinc-400">{finish.extraCostPerM2 > 0 ? `+$${finish.extraCostPerM2}` : "—"}</td>
                    <td className="px-4 py-4"><Badge tone={finish.active ? 'emerald' : 'rose'}>{finish.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(finish)}>Editar</Button>
                        <Button variant="ghost" className="h-9" onClick={() => handleToggle(finish)}>{finish.active ? "Desactivar" : "Activar"}</Button>
                        <Button variant="danger" className="h-9" onClick={() => handleDelete(finish)}>Eliminar</Button>
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
        <FinishFormModal
          finish={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}
