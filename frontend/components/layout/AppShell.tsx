"use client";

import { motion } from "framer-motion";
import { LogOut, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";

export function AppShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-transparent text-white">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 px-4 py-6 lg:px-8">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={22} />
            </button>
            <div>
              <p className="text-sm text-indigo-300">{subtitle}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight lg:text-4xl">{title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
            <div className="hidden sm:block">
              <div className="font-medium text-white">{user?.name ?? "Invitado"}</div>
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{user?.role ?? "demo"}</div>
            </div>
            <Button
              variant="ghost"
              className="h-10 w-10 rounded-xl px-0"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </header>
        <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {children}
        </motion.main>
      </div>
    </div>
  );
}
