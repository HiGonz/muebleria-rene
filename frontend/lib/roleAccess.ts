"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";

export type Role = "admin" | "seller" | "taller";

// Mirrors the backend's route-gate matrix exactly (Gate::define in
// AppServiceProvider.php) — this is a UI convenience (hide the nav link,
// bounce a direct URL hit) layered on top of the real enforcement, not a
// substitute for it.
export const PAGE_ROLES: Record<string, Role[]> = {
  "/dashboard": ["admin", "seller", "taller"],
  "/projects/new": ["admin", "seller"],
  "/kitchen": ["admin", "seller"],
  "/kitchen/projects": ["admin", "seller", "taller"],
  "/closet": ["admin", "seller"],
  "/materials": ["admin"],
  "/finishes": ["admin"],
  "/quotes": ["admin", "seller"],
  "/projects": ["admin", "seller", "taller"],
  "/users": ["admin"],
};

// Redirects away from a page the signed-in user's role can't access. Must
// be called from a page component (not the Sidebar, which only hides the
// nav link — this covers someone typing the URL directly). No-ops while
// the auth store hasn't hydrated yet (user is null very briefly on a fresh
// load) so it doesn't bounce a legitimate user before their session loads.
export function useRoleGuard(allowedRoles: Role[]): void {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!role) return;
    if (!allowedRoles.includes(role)) {
      toast.error("No tienes acceso a esa sección.");
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
}
