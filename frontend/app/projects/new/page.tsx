import { AppShell } from "@/components/layout/AppShell";
import { ProjectWizard } from "@/components/projects/ProjectWizard";

export default function NewProjectPage() {
  return (
    <AppShell title="Nuevo diseño" subtitle="Flujo guiado de creación y pre-cotización">
      <ProjectWizard />
    </AppShell>
  );
}
