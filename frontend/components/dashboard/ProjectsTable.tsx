"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { ProjectRecord } from "@/services/mockData";

const toneByStatus = {
  Borrador: "zinc",
  "En diseño": "indigo",
  Cotizado: "amber",
  Aprobado: "emerald",
} as const;

export function ProjectsTable({ projects }: { projects: ProjectRecord[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("Todos");
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const filtered = useMemo(() => {
    const items = statusFilter === "Todos" ? projects : projects.filter((project) => project.status === statusFilter);
    return items;
  }, [projects, statusFilter]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Proyectos recientes</h3>
          <p className="text-sm text-zinc-400">Filtra por estado y navega al detalle del proyecto</p>
        </div>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
          className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white"
        >
          {["Todos", "Borrador", "En diseño", "Cotizado", "Aprobado"].map((status) => (
            <option key={status} value={status} className="bg-[#111118]">
              {status}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              {['Cliente', 'Proyecto', 'Tipo', 'Estado', 'Fecha', 'Acciones'].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((project) => (
              <tr key={project.id} className="border-t border-white/6 transition hover:bg-white/4">
                <td className="px-4 py-4">{project.clientName}</td>
                <td className="px-4 py-4">{project.projectName}</td>
                <td className="px-4 py-4">{project.type}</td>
                <td className="px-4 py-4"><Badge tone={toneByStatus[project.status]}>{project.status}</Badge></td>
                <td className="px-4 py-4 text-zinc-400">{formatDate(project.createdAt)}</td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <Link href={`/projects/${project.id}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-zinc-200 hover:bg-white/6">
                      <Eye size={15} /> Ver
                    </Link>
                    <Link href={`/projects/${project.id}/quote`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-500/16 px-3 text-indigo-100 hover:bg-indigo-500/24">
                      <ArrowRight size={15} /> Cotizar
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
        <span>Página {page} de {pageCount}</span>
        <div className="flex gap-2">
          <Button variant="secondary" className="h-9" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
          <Button variant="secondary" className="h-9" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
        </div>
      </div>
    </Card>
  );
}
