"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ProjectWizard } from "@/components/projects/ProjectWizard";
import { useRoleGuard, PAGE_ROLES } from "@/lib/roleAccess";

export default function NewProjectPage() {
  useRoleGuard(PAGE_ROLES["/projects/new"]);
  return (
    <AppShell title="Nuevo diseño" subtitle="Flujo guiado de creación y pre-cotización">
      <ProjectWizard />
    </AppShell>
  );
}
