"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, FileText, LayoutDashboard, PlusSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects/new", label: "Nuevo diseño", icon: PlusSquare },
  { href: "/materials", label: "Materiales", icon: Boxes },
  { href: "/quotes", label: "Cotizaciones", icon: FileText },
  { href: "/projects", label: "Proyectos", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass sticky top-0 flex h-screen w-72 flex-col gap-6 rounded-r-3xl border-l-0 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-indigo-300">Mueblería Rene</p>
        <h1 className="mt-2 text-2xl font-semibold">Studio CAD</h1>
      </div>
      <nav className="space-y-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/6 hover:text-white",
                active && "bg-indigo-500/16 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.45)]",
              )}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {active && <span className="ml-auto h-2 w-2 rounded-full bg-indigo-400" />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/4 p-4">
        <p className="text-sm font-medium text-white">Demo SaaS Ready</p>
        <p className="mt-1 text-sm text-zinc-400">Diseño oscuro, 3D paramétrico y flujo comercial completo.</p>
      </div>
    </aside>
  );
}
