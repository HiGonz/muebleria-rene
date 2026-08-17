import { http } from "./http";
import { calculateMaterials, quoteTotals, type FurnitureType, type MaterialKind } from "./materialCalculator";
import type { ProjectDraft } from "@/store/useProjectStore";
import type { ProjectRecord, ProjectStatus, QuoteStatus } from "./mockData";
import type { KitchenDraft, KitchenModule, ModuleCategory, KitchenModuleType, WallOpening } from "@/types/kitchen";

// ─── Backend response shapes (only the fields we actually read) ────────────────
interface BackendDimensions {
  height: number;
  width: number;
  depth: number;
  shelves: number;
  drawers: number;
  doors: number;
}

interface BackendProject {
  id: number;
  client_name: string;
  client_phone: string;
  project_name: string;
  furniture_type: string;
  material: string;
  color: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  dimensions: BackendDimensions;
}

interface BackendQuote {
  id: number;
  folio: string;
  status: QuoteStatus;
  subtotal_materials: string | number;
  labor_percentage: number;
  profit_percentage: number;
  labor_cost: string | number;
  profit_cost: string | number;
  total: string | number;
  valid_until: string;
  project: BackendProject;
}

interface BackendMaterial {
  id: number;
  name: string;
  code: string | null;
  type: string;
  unit: string;
  cost_per_unit: string | number;
  stock: string | number;
  active: boolean;
  default_floor: boolean;
  default_wall: boolean;
}

interface BackendFinish {
  id: number;
  name: string;
  code: string;
  type: "panel" | "cubierta" | "ambos";
  source_image_url: string;
  texture_url: string;
  swatch_color: string;
  repeat_scale: number | string;
  roughness: number | string;
  extra_cost_per_m2: number | string;
  active: boolean;
}

interface BackendKitchenModule {
  id: number;
  module_type: string;
  category: ModuleCategory;
  label: string;
  height: number;
  width: number;
  depth: number;
  x: number;
  z: number;
  rotation: number;
  options: KitchenModule["options"];
}

interface BackendKitchenProject {
  id: number;
  client_name: string | null;
  client_phone: string | null;
  project_name: string;
  notes: string | null;
  room_width: number;
  room_depth: number;
  ceiling_height: number;
  openings: WallOpening[] | null;
  status: string;
  autosave_enabled: boolean;
  created_at: string;
  updated_at: string;
  modules?: BackendKitchenModule[];
  modules_count?: number;
  quote?: { total: string | number; status: string; folio: string } | null;
}

interface Paginated<T> {
  data: T[];
}

// ─── Mappers ─────────────────────────────────────────────────────────────────
function mapProject(p: BackendProject): ProjectRecord {
  return {
    id: String(p.id),
    clientName: p.client_name,
    clientPhone: p.client_phone,
    projectName: p.project_name,
    type: p.furniture_type as FurnitureType,
    status: p.status as ProjectStatus,
    material: p.material as MaterialKind,
    color: p.color ?? "#8b5e3c",
    notes: p.notes ?? "",
    height: p.dimensions.height,
    width: p.dimensions.width,
    depth: p.dimensions.depth,
    shelves: p.dimensions.shelves,
    drawers: p.dimensions.drawers,
    doors: p.dimensions.doors,
    createdAt: p.created_at,
  };
}

function mapKitchenPayload(draft: KitchenDraft) {
  const clientName = draft.clientName.trim();
  return {
    client_name: clientName || null,
    client_phone: draft.clientPhone || null,
    project_name: draft.projectName.trim() || "Cocina nueva",
    notes: draft.notes || null,
    room_width: draft.roomWidth,
    room_depth: draft.roomDepth,
    ceiling_height: draft.ceilingHeight,
    autosave_enabled: draft.autosaveEnabled,
    openings: draft.openings,
    modules: draft.modules.map((m) => ({
      module_type: m.type,
      category: m.category,
      label: m.label,
      height: m.dimensions.height,
      width: m.dimensions.width,
      depth: m.dimensions.depth,
      x: Math.round(m.x * 100) / 100,
      z: Math.round(m.z * 100) / 100,
      rotation: m.rotation,
      options: m.options,
    })),
  };
}

function mapKitchenResponseToDraft(json: BackendKitchenProject): KitchenDraft {
  return {
    clientName: json.client_name ?? "",
    clientPhone: json.client_phone ?? "",
    projectName: json.project_name,
    notes: json.notes ?? "",
    autosaveEnabled: json.autosave_enabled,
    roomWidth: json.room_width,
    roomDepth: json.room_depth,
    ceilingHeight: json.ceiling_height,
    modules: (json.modules ?? []).map((m) => ({
      id: String(m.id),
      category: m.category,
      type: m.module_type as KitchenModuleType,
      label: m.label,
      dimensions: { height: m.height, width: m.width, depth: m.depth },
      options: m.options,
      x: m.x,
      z: m.z,
      rotation: (m.rotation as 0 | 90 | 180 | 270) ?? 0,
    })),
    openings: json.openings ?? [],
    editingModuleId: null,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string) {
  const data = await http.post<{ token: string; user: { name: string; email: string; role: "admin" | "seller" | "taller" } }>("/login", { email, password });
  return { token: data.token, user: { name: data.user.name, email: data.user.email, role: data.user.role } };
}

export async function logout() {
  await http.post("/logout").catch(() => undefined);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export async function getDashboard() {
  return http.get<{
    activeProjects: { value: number; change: number };
    monthlyQuotes: { value: number; change: number };
    topMaterial: { value: string; quantity: string; change: number };
    estimatedSales: { value: number; change: number };
    weeklyQuotes: { week: string; quotes: number }[];
    recentProjects: BackendProject[];
  }>("/dashboard/stats").then((data) => ({
    ...data,
    recentProjects: data.recentProjects.map(mapProject),
  }));
}

// ─── Projects ────────────────────────────────────────────────────────────────
export async function listProjects(): Promise<ProjectRecord[]> {
  const page = await http.get<Paginated<BackendProject>>("/projects");
  return page.data.map(mapProject);
}

export async function getProject(id: string): Promise<ProjectRecord> {
  const project = await http.get<BackendProject>(`/projects/${id}`);
  return mapProject(project);
}

export async function createProject(draft: ProjectDraft): Promise<ProjectRecord> {
  const project = await http.post<BackendProject>("/projects", {
    client_name: draft.clientName,
    client_phone: draft.clientPhone,
    project_name: draft.projectName,
    furniture_type: draft.type,
    material: draft.material,
    color: draft.color,
    notes: draft.notes || null,
    dimensions: {
      height: draft.height,
      width: draft.width,
      depth: draft.depth,
      shelves: draft.shelves,
      drawers: draft.drawers,
      doors: draft.doors,
    },
  });
  return mapProject(project);
}

// ─── Quotes ──────────────────────────────────────────────────────────────────
export async function getQuote(projectId: string) {
  const quote = await http.post<BackendQuote>(`/projects/${projectId}/quote`);
  const project = mapProject(quote.project);
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
    id: String(quote.id),
    folio: quote.folio,
    project,
    status: quote.status,
    materials,
    subtotalMaterials: Number(quote.subtotal_materials),
    laborPercentage: quote.labor_percentage,
    profitPercentage: quote.profit_percentage,
    laborCost: Number(quote.labor_cost),
    profitCost: Number(quote.profit_cost),
    total: Number(quote.total),
    validUntil: quote.valid_until,
  };
}

export async function listQuotes() {
  const quotes = await http.get<BackendQuote[]>("/quotes");
  return quotes.map((quote) => ({
    id: String(quote.id),
    folio: quote.folio,
    project: mapProject(quote.project),
    status: quote.status,
    total: Number(quote.total),
  }));
}

// ─── Materials ───────────────────────────────────────────────────────────────
export async function listMaterials() {
  const materials = await http.get<BackendMaterial[]>("/materials");
  return materials.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    type: m.type,
    unit: m.unit,
    cost: Number(m.cost_per_unit),
    stock: Number(m.stock),
    active: m.active,
    defaultFloor: m.default_floor,
    defaultWall: m.default_wall,
  }));
}

export interface MaterialInput {
  name: string;
  code?: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
  defaultFloor?: boolean;
  defaultWall?: boolean;
}

function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active, defaultFloor: m.default_floor, defaultWall: m.default_wall };
}

export async function createMaterial(input: MaterialInput) {
  const material = await http.post<BackendMaterial>("/materials", {
    name: input.name,
    code: input.code || null,
    type: input.type,
    unit: input.unit,
    cost_per_unit: input.cost,
    stock: input.stock,
    active: input.active,
    default_floor: input.defaultFloor,
    default_wall: input.defaultWall,
  });
  return mapMaterial(material);
}

export async function updateMaterial(id: number, patch: Partial<MaterialInput>) {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.code !== undefined) body.code = patch.code || null;
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.unit !== undefined) body.unit = patch.unit;
  if (patch.cost !== undefined) body.cost_per_unit = patch.cost;
  if (patch.stock !== undefined) body.stock = patch.stock;
  if (patch.active !== undefined) body.active = patch.active;
  if (patch.defaultFloor !== undefined) body.default_floor = patch.defaultFloor;
  if (patch.defaultWall !== undefined) body.default_wall = patch.defaultWall;
  const material = await http.put<BackendMaterial>(`/materials/${id}`, body);
  return mapMaterial(material);
}

export async function deleteMaterial(id: number) {
  await http.delete(`/materials/${id}`);
}

// ─── Finishes ────────────────────────────────────────────────────────────────
export interface Finish {
  id: number;
  name: string;
  code: string;
  type: "panel" | "cubierta" | "ambos";
  sourceImageUrl: string;
  textureUrl: string;
  swatchColor: string;
  repeatScale: number;
  roughness: number;
  extraCostPerM2: number;
  active: boolean;
}

function mapFinish(f: BackendFinish): Finish {
  return {
    id: f.id,
    name: f.name,
    code: f.code,
    type: f.type,
    sourceImageUrl: f.source_image_url,
    textureUrl: f.texture_url,
    swatchColor: f.swatch_color,
    repeatScale: Number(f.repeat_scale),
    roughness: Number(f.roughness),
    extraCostPerM2: Number(f.extra_cost_per_m2),
    active: f.active,
  };
}

export async function listFinishes(): Promise<Finish[]> {
  const finishes = await http.get<BackendFinish[]>("/finishes");
  return finishes.map(mapFinish);
}

export interface FinishInput {
  name: string;
  code: string;
  type: "panel" | "cubierta" | "ambos";
  photo?: File;
  repeatScale?: number;
  roughness?: number;
  extraCostPerM2?: number;
  active?: boolean;
}

function finishFormData(input: Partial<FinishInput>): FormData {
  const fd = new FormData();
  if (input.name !== undefined) fd.set("name", input.name);
  if (input.code !== undefined) fd.set("code", input.code);
  if (input.type !== undefined) fd.set("type", input.type);
  if (input.photo) fd.set("photo", input.photo);
  if (input.repeatScale !== undefined) fd.set("repeat_scale", String(input.repeatScale));
  if (input.roughness !== undefined) fd.set("roughness", String(input.roughness));
  if (input.extraCostPerM2 !== undefined) fd.set("extra_cost_per_m2", String(input.extraCostPerM2));
  if (input.active !== undefined) fd.set("active", input.active ? "1" : "0");
  return fd;
}

export async function createFinish(input: FinishInput): Promise<Finish> {
  const finish = await http.postForm<BackendFinish>("/finishes", finishFormData(input));
  return mapFinish(finish);
}

export async function updateFinish(id: number, patch: Partial<FinishInput>): Promise<Finish> {
  const fd = finishFormData(patch);
  fd.set("_method", "PUT");
  const finish = await http.postForm<BackendFinish>(`/finishes/${id}`, fd);
  return mapFinish(finish);
}

export async function deleteFinish(id: number): Promise<void> {
  await http.delete(`/finishes/${id}`);
}

// ─── Users ───────────────────────────────────────────────────────────────────
interface BackendUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
  active: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
  active: boolean;
}

function mapUser(u: BackendUser): User {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active };
}

export async function listUsers(): Promise<User[]> {
  const users = await http.get<BackendUser[]>("/users");
  return users.map(mapUser);
}

export interface UserInput {
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
  password?: string;
  active?: boolean;
}

export async function createUser(input: UserInput): Promise<User> {
  const user = await http.post<BackendUser>("/users", input);
  return mapUser(user);
}

export async function updateUser(id: number, patch: Partial<UserInput>): Promise<User> {
  const user = await http.put<BackendUser>(`/users/${id}`, patch);
  return mapUser(user);
}

export async function deactivateUser(id: number): Promise<User> {
  const user = await http.delete<BackendUser>(`/users/${id}`);
  return mapUser(user);
}

// ─── Kitchen Projects ────────────────────────────────────────────────────────
export const KITCHEN_PROJECT_STATUSES = ["Borrador", "En diseño", "Cotizado", "Aprobado", "En producción", "Entregado"] as const;
export type KitchenProjectStatus = (typeof KITCHEN_PROJECT_STATUSES)[number];

export async function listKitchenProjects() {
  const page = await http.get<Paginated<BackendKitchenProject>>("/kitchen-projects");
  return page.data.map((p) => ({
    id: p.id,
    projectName: p.project_name,
    clientName: p.client_name ?? "",
    clientPhone: p.client_phone ?? "",
    roomWidth: p.room_width,
    roomDepth: p.room_depth,
    status: p.status as KitchenProjectStatus,
    modulesCount: p.modules_count ?? 0,
    total: p.quote?.total != null ? Number(p.quote.total) : null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

export async function updateKitchenProjectStatus(id: number, status: KitchenProjectStatus): Promise<void> {
  await http.put(`/kitchen-projects/${id}`, { status });
}

export async function updateKitchenAutosaveEnabled(id: number, autosaveEnabled: boolean): Promise<void> {
  await http.put(`/kitchen-projects/${id}`, { autosave_enabled: autosaveEnabled });
}

export async function getKitchenProject(id: number): Promise<KitchenDraft> {
  const project = await http.get<BackendKitchenProject>(`/kitchen-projects/${id}`);
  return mapKitchenResponseToDraft(project);
}

export async function saveKitchenProject(draft: KitchenDraft, projectId: number | null): Promise<number> {
  const payload = mapKitchenPayload(draft);
  if (projectId === null) {
    const created = await http.post<BackendKitchenProject>("/kitchen-projects", payload);
    return created.id;
  }
  const { modules, ...meta } = payload;
  await http.put(`/kitchen-projects/${projectId}`, meta);
  await http.post(`/kitchen-projects/${projectId}/modules/sync`, { modules });
  return projectId;
}

export interface KitchenShare {
  token: string;
  url: string;
  viewCount: number;
  createdAt: string;
}

export async function createKitchenShare(id: number): Promise<KitchenShare> {
  return http.post<KitchenShare>(`/kitchen-projects/${id}/share`);
}

export async function revokeKitchenShare(id: number): Promise<void> {
  await http.delete(`/kitchen-projects/${id}/share`);
}

export async function deleteKitchenProject(id: number): Promise<void> {
  await http.delete(`/kitchen-projects/${id}`);
}
