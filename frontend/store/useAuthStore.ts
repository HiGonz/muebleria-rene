"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  name: string;
  email: string;
  role: "admin" | "seller";
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setSession: (user: AuthUser, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setSession: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: "muebleria-auth" },
  ),
);
