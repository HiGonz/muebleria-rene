import type { FurnitureType, MaterialKind } from "./materialCalculator";

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
