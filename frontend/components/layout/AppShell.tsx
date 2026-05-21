"use client";

import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";

export function AppShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-transparent text-white">
      <Sidebar />
      <div className="flex-1 px-6 py-6 lg:px-8">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-indigo-300">{subtitle}</p>
            <h2 className="mt-1 text-4xl font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
            <div>
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
