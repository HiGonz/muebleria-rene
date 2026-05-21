import { calculateMaterials, quoteTotals, type FurnitureType, type MaterialKind } from "./materialCalculator";

export type ProjectStatus = "Borrador" | "En diseño" | "Cotizado" | "Aprobado";
export type QuoteStatus = "Borrador" | "Enviada" | "Aprobada" | "Rechazada";

export interface ProjectRecord {
  id: string;
  clientName: string;
  clientPhone: string;
  projectName: string;
  type: FurnitureType;
  status: ProjectStatus;
  material: MaterialKind;
  color: string;
  notes: string;
  height: number;
  width: number;
  depth: number;
  shelves: number;
  drawers: number;
  doors: number;
  createdAt: string;
}

const baseProjects: ProjectRecord[] = [
  {
    id: "PRJ-001",
    clientName: "Juan Pérez",
    clientPhone: "871 123 4567",
    projectName: "Closet Principal",
    type: "Closet",
    status: "Cotizado",
    material: "Melamina nogal",
    color: "#8b5e3c",
    notes: "Incluir espejo interior y canto reforzado.",
    height: 220,
    width: 180,
    depth: 60,
    shelves: 4,
    drawers: 3,
    doors: 2,
    createdAt: "2026-05-15T09:00:00.000Z",
  },
  {
    id: "PRJ-002",
    clientName: "María López",
    clientPhone: "871 555 9911",
    projectName: "Escritorio Ejecutivo",
    type: "Escritorio",
    status: "En diseño",
    material: "MDF",
    color: "#4f3c2d",
    notes: "Agregar pasacables y repisa inferior.",
    height: 75,
    width: 160,
    depth: 70,
    shelves: 1,
    drawers: 2,
    doors: 0,
    createdAt: "2026-05-18T11:30:00.000Z",
  },
  {
    id: "PRJ-003",
    clientName: "Carlos Ramos",
    clientPhone: "871 222 7788",
    projectName: "Centro de TV",
    type: "Mueble TV",
    status: "Aprobado",
    material: "Melamina blanca",
    color: "#f3f4f6",
    notes: "Compatibilidad con pantalla de 75 pulgadas.",
    height: 65,
    width: 210,
    depth: 45,
    shelves: 2,
    drawers: 2,
    doors: 2,
    createdAt: "2026-05-20T15:00:00.000Z",
  },
];

export const demoUsers = {
  "admin@demo.com": { password: "password", role: "admin", name: "Administrador" },
  "seller@demo.com": { password: "password", role: "seller", name: "Vendedor" },
} as const;

export function getProjects() {
  return baseProjects;
}

export function getProjectById(id: string) {
  return baseProjects.find((project) => project.id === id) ?? baseProjects[0];
}

export function getMaterialsCatalog() {
  return [
    { id: 1, name: "MDF 15mm", type: "Tablero", unit: "m²", cost: 160, stock: 24, active: true },
    { id: 2, name: "MDF 18mm", type: "Tablero", unit: "m²", cost: 180, stock: 32, active: true },
    { id: 3, name: "Melamina blanca 18mm", type: "Tablero", unit: "m²", cost: 210, stock: 28, active: true },
    { id: 4, name: "Melamina nogal 18mm", type: "Tablero", unit: "m²", cost: 245, stock: 18, active: true },
    { id: 5, name: "Triplay 9mm", type: "Tablero", unit: "m²", cost: 135, stock: 20, active: true },
    { id: 6, name: "Triplay 12mm", type: "Tablero", unit: "m²", cost: 195, stock: 16, active: true },
    { id: 7, name: "Bisagra 35mm", type: "Herraje", unit: "pzas", cost: 35, stock: 120, active: true },
    { id: 8, name: "Corredera telescópica 450mm", type: "Herraje", unit: "pares", cost: 95, stock: 48, active: true },
    { id: 9, name: "Canto PVC 0.4mm", type: "Acabado", unit: "ml", cost: 12, stock: 200, active: true },
    { id: 10, name: "Tornillo confimát", type: "Fijación", unit: "pzas", cost: 2.5, stock: 850, active: true },
    { id: 11, name: "Jalador moderno", type: "Herraje", unit: "pzas", cost: 60, stock: 75, active: true },
  ];
}

export function getDashboardStats() {
  const projects = getProjects();
  return {
    activeProjects: { value: 12, change: 18.2, trend: [5, 6, 7, 7, 8, 10, 12] },
    monthlyQuotes: { value: 26, change: 12.4, trend: [10, 11, 12, 13, 17, 22, 26] },
    topMaterial: { value: "Melamina nogal", quantity: "18.4 m²", change: 8.5, trend: [4, 6, 9, 10, 12, 15, 18] },
    estimatedSales: { value: 184500, change: 22.1, trend: [80, 96, 105, 112, 131, 150, 184] },
    weeklyQuotes: [
      { week: "Sem 1", quotes: 4 },
      { week: "Sem 2", quotes: 7 },
      { week: "Sem 3", quotes: 6 },
      { week: "Sem 4", quotes: 9 },
    ],
    recentProjects: projects,
  };
}

export function getQuoteForProject(projectId: string) {
  const project = getProjectById(projectId);
  const materials = calculateMaterials({
    type: project.type,
    width: project.width,
    height: project.height,
    depth: project.depth,
    shelves: project.shelves,
    drawers: project.drawers,
    doors: project.doors,
    material: project.material,
  });

  return {
    id: `Q-${project.id}`,
    folio: `2025-${project.id.slice(-3).padStart(4, "0")}`,
    project,
    status: project.status === "Aprobado" ? "Aprobada" : project.status === "Cotizado" ? "Enviada" : "Borrador",
    materials,
    ...quoteTotals(materials),
    validUntil: "2026-06-05",
  } satisfies {
    id: string;
    folio: string;
    project: ProjectRecord;
    status: QuoteStatus;
    materials: ReturnType<typeof calculateMaterials>;
    subtotalMaterials: number;
    laborPercentage: number;
    profitPercentage: number;
    laborCost: number;
    profitCost: number;
    total: number;
    validUntil: string;
  };
}

export function getQuotes() {
  return baseProjects.map((project) => getQuoteForProject(project.id));
}
