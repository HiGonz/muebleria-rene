"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, FileText, LayoutDashboard, PlusSquare, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects/new", label: "Nuevo diseño", icon: PlusSquare },
  { href: "/kitchen", label: "Diseñar cocina", icon: UtensilsCrossed },
  { href: "/kitchen/projects", label: "Cocinas", icon: BarChart3 },
  { href: "/materials", label: "Materiales", icon: Boxes },
  { href: "/quotes", label: "Cotizaciones", icon: FileText },
  { href: "/projects", label: "Proyectos", icon: BarChart3 },
];

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "glass fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col gap-6 rounded-r-3xl border-l-0 p-5 transition-transform duration-300",
          "lg:sticky lg:top-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Close button — mobile only */}
        <button
          className="absolute right-4 top-4 rounded-xl p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={onClose}
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>

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
                onClick={onClose}
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
    </>
  );
}
