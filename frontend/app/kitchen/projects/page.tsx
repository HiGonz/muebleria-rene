import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { listKitchenProjects } from "@/services/api";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Cocinas — Proyectos" };

export default async function KitchenProjectsPage() {
  const projects = await listKitchenProjects();

  const fmtMXN = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

  const STATUS_COLORS: Record<string, string> = {
    Borrador: "text-zinc-400 bg-zinc-800",
    "En diseño": "text-blue-300 bg-blue-950",
    Cotizado: "text-amber-300 bg-amber-950",
    Aprobado: "text-emerald-300 bg-emerald-950",
    "En producción": "text-violet-300 bg-violet-950",
    Entregado: "text-green-300 bg-green-950",
  };

  return (
    <AppShell title="Proyectos de Cocina" subtitle="Diseños modulares de cocinas completas">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-zinc-400">{projects.length} proyecto{projects.length !== 1 ? "s" : ""}</p>
        <Link href="/kitchen">
          <Button variant="primary">+ Nueva cocina</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
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
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left">
                {["Proyecto", "Cliente", "Distribución", "Módulos", "Cotización", "Estado", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-white">{p.projectName}</p>
                    <p className="text-xs text-zinc-500">{p.id}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-zinc-200">{p.clientName}</p>
                    <p className="text-xs text-zinc-500">{p.clientPhone}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-300">{p.kitchenStyle}</td>
                  <td className="px-5 py-3 text-zinc-300">{p.modulesCount}</td>
                  <td className="px-5 py-3 text-emerald-400 font-medium">{fmtMXN(p.total)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[p.status] ?? "text-zinc-400 bg-zinc-800"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link href="/kitchen" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
