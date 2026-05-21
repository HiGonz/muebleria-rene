import { demoUsers, getDashboardStats, getMaterialsCatalog, getProjectById, getProjects, getQuoteForProject, getQuotes } from "./mockData";

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
