import Link from "next/link";
import { Boxes, BriefcaseBusiness, CircleDollarSign, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";
import { ProjectsTable } from "@/components/dashboard/ProjectsTable";
import { getDashboard } from "@/services/api";

export default async function DashboardPage() {
  const dashboard = await getDashboard();
  return (
    <AppShell title="Dashboard" subtitle="Control operativo y comercial">
      <div className="mb-6 flex justify-end">
        <Link href="/projects/new"><Button>+ Nuevo diseño</Button></Link>
      </div>
      <section className="grid gap-4 xl:grid-cols-4">
        <KpiCard title="Proyectos activos" value={dashboard.activeProjects.value} change={dashboard.activeProjects.change} icon={BriefcaseBusiness} />
        <KpiCard title="Cotizaciones del mes" value={dashboard.monthlyQuotes.value} change={dashboard.monthlyQuotes.change} icon={Sparkles} />
        <KpiCard title="Material más utilizado" value={dashboard.topMaterial.value} change={dashboard.topMaterial.change} icon={Boxes} helper={dashboard.topMaterial.quantity} />
        <KpiCard title="Ventas estimadas del mes" value={dashboard.estimatedSales.value} change={dashboard.estimatedSales.change} icon={CircleDollarSign} accent="emerald" />
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <WeeklyChart data={dashboard.weeklyQuotes} />
        <ProjectsTable projects={dashboard.recentProjects} />
      </section>
    </AppShell>
  );
}
