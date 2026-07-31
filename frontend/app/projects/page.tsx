"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { ProjectsTable } from "@/components/dashboard/ProjectsTable";
import { listProjects } from "@/services/api";
import type { ProjectRecord } from "@/services/mockData";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  return (
    <AppShell title="Proyectos" subtitle="Seguimiento de clientes y diseños activos">
      {!projects ? <Card>Cargando...</Card> : <ProjectsTable projects={projects} />}
    </AppShell>
  );
}
