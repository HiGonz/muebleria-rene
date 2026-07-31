"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { listKitchenProjects, updateKitchenProjectStatus, KITCHEN_PROJECT_STATUSES, type KitchenProjectStatus } from "@/services/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type KitchenProjectRow = Awaited<ReturnType<typeof listKitchenProjects>>[number];

const STATUS_COLORS: Record<string, string> = {
  Borrador: "text-zinc-400 bg-zinc-800",
  "En diseño": "text-blue-300 bg-blue-950",
  Cotizado: "text-amber-300 bg-amber-950",
  Aprobado: "text-emerald-300 bg-emerald-950",
  "En producción": "text-violet-300 bg-violet-950",
  Entregado: "text-green-300 bg-green-950",
};

export default function KitchenProjectsPage() {
  const [projects, setProjects] = useState<KitchenProjectRow[] | null>(null);

  useEffect(() => {
    listKitchenProjects().then(setProjects);
  }, []);

  const fmtMXN = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

  const changeStatus = async (id: number, status: KitchenProjectStatus) => {
    const previous = projects;
    // Optimistic — the dropdown itself is the only feedback most of the time.
    setProjects((cur) => cur?.map((p) => (p.id === id ? { ...p, status } : p)) ?? cur);
    try {
      await updateKitchenProjectStatus(id, status);
    } catch (error) {
      setProjects(previous);
      toast.error(error instanceof Error ? error.message : "No fue posible actualizar el estado.");
    }
  };

  return (
    <AppShell title="Proyectos de Cocina" subtitle="Diseños modulares de cocinas completas">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-zinc-400">{projects ? `${projects.length} proyecto${projects.length !== 1 ? "s" : ""}` : "Cargando..."}</p>
        <Link href="/kitchen">
          <Button variant="primary">+ Nueva cocina</Button>
        </Link>
      </div>

      {projects && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-white/8 bg-white/4 py-20 text-center">
          <div className="text-6xl opacity-30">🍳</div>
          <div>
            <h3 className="text-base font-semibold text-white">Sin proyectos de cocina</h3>
            <p className="mt-1 text-sm text-zinc-500">Empieza diseñando una cocina modular completa.</p>
          </div>
          <Link href="/kitchen">
            <Button variant="primary">Diseñar primera cocina</Button>
          </Link>
        </div>
      ) : projects ? (
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left">
                {["Proyecto", "Cliente", "Habitación", "Módulos", "Cotización", "Estado", "Creado", "Modificado", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white">{p.projectName}</p>
                    <p className="text-xs text-zinc-500">KIT-{p.id}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-zinc-200">{p.clientName}</p>
                    <p className="text-xs text-zinc-500">{p.clientPhone}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-300 whitespace-nowrap">{p.roomWidth} × {p.roomDepth} cm</td>
                  <td className="px-5 py-3 text-zinc-300">{p.modulesCount}</td>
                  <td className="px-5 py-3 text-emerald-400 font-medium whitespace-nowrap">{fmtMXN(p.total)}</td>
                  <td className="px-5 py-3">
                    <select
                      value={p.status}
                      onChange={(e) => changeStatus(p.id, e.target.value as KitchenProjectStatus)}
                      className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[p.status] ?? "text-zinc-400 bg-zinc-800"}`}
                    >
                      {KITCHEN_PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-[#111118] text-zinc-200">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                  <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(p.updatedAt)}</td>
                  <td className="px-5 py-3">
                    <Link href={`/kitchen?projectId=${p.id}`} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap">
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppShell>
  );
}
