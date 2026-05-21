import { AppShell } from "@/components/layout/AppShell";
import { ProjectsTable } from "@/components/dashboard/ProjectsTable";
import { listProjects } from "@/services/api";

export default async function ProjectsPage() {
  const projects = await listProjects();
  return (
    <AppShell title="Proyectos" subtitle="Seguimiento de clientes y diseños activos">
      <ProjectsTable projects={projects} />
    </AppShell>
  );
}
