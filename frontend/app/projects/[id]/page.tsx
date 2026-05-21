import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SceneCanvas } from "@/components/3d/SceneCanvas";
import { getProject } from "@/services/api";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);

  return (
    <AppShell title={project.projectName} subtitle={`Proyecto ${project.id}`}>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Cliente</p>
              <h3 className="text-xl font-semibold">{project.clientName}</h3>
            </div>
            <Badge tone={project.status === 'Aprobado' ? 'emerald' : project.status === 'Cotizado' ? 'amber' : 'indigo'}>{project.status}</Badge>
          </div>
          <div className="grid gap-3 text-sm text-zinc-300">
            <div>Teléfono: <span className="text-white">{project.clientPhone}</span></div>
            <div>Tipo: <span className="text-white">{project.type}</span></div>
            <div>Material: <span className="text-white">{project.material}</span></div>
            <div>Medidas: <span className="text-white">{project.width} × {project.height} × {project.depth} cm</span></div>
            <div>Repisas: <span className="text-white">{project.shelves}</span></div>
            <div>Cajones: <span className="text-white">{project.drawers}</span></div>
            <div>Puertas: <span className="text-white">{project.doors}</span></div>
          </div>
          <p className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm text-zinc-400">{project.notes}</p>
          <a href={`/projects/${project.id}/quote`}><Button className="w-full">Cotizar proyecto</Button></a>
        </Card>
        <SceneCanvas type={project.type} width={project.width} height={project.height} depth={project.depth} shelves={project.shelves} drawers={project.drawers} doors={project.doors} color={project.color} />
      </div>
    </AppShell>
  );
}
