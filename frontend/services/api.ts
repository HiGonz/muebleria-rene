import { demoUsers, getDashboardStats, getMaterialsCatalog, getProjectById, getProjects, getQuoteForProject, getQuotes, getKitchenProjects } from "./mockData";
import type { KitchenDraft } from "@/types/kitchen";

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

export async function login(email: string, password: string) {
  await wait();
  const user = demoUsers[email as keyof typeof demoUsers];
  if (!user || user.password !== password) {
    throw new Error("Correo o contraseña incorrectos.");
  }
  return { email, role: user.role, name: user.name };
}

export async function getDashboard() {
  await wait();
  return getDashboardStats();
}

export async function listProjects() {
  await wait();
  return getProjects();
}

export async function getProject(id: string) {
  await wait();
  return getProjectById(id);
}

export async function getQuote(projectId: string) {
  await wait();
  return getQuoteForProject(projectId);
}

export async function listQuotes() {
  await wait();
  return getQuotes();
}

export async function listMaterials() {
  await wait();
  return getMaterialsCatalog();
}

// ─── Kitchen Projects ──────────────────────────────────────────────────────────
export async function listKitchenProjects() {
  await wait();
  return getKitchenProjects();
}

export async function saveKitchenProject(draft: KitchenDraft) {
  await wait(600);
  // In production: POST /api/kitchen-projects with modules
  return { id: `KIT-${Date.now()}`, ...draft, status: "Borrador" };
}

export async function syncKitchenModules(projectId: string, draft: KitchenDraft) {
  await wait(400);
  // In production: POST /api/kitchen-projects/:id/modules/sync
  return { projectId, modulesCount: draft.modules.length, saved: true };
}

export async function generateKitchenQuote(projectId: string, summary: {
  subtotalMaterials: number;
  laborPercentage: number;
  profitPercentage: number;
  laborCost: number;
  profitCost: number;
  total: number;
  materialLines: unknown[];
}) {
  await wait(500);
  return { ...summary, folio: `KIT-${projectId}`, status: "Borrador" };
}
