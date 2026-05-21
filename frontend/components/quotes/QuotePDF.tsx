"use client";

import { forwardRef } from "react";
import { formatCurrency } from "@/lib/utils";
import type { MaterialItem } from "@/services/materialCalculator";
import type { ProjectRecord, QuoteStatus } from "@/services/mockData";

interface QuotePDFProps {
  folio: string;
  validUntil: string;
  project: ProjectRecord;
  materials: MaterialItem[];
  subtotalMaterials: number;
  laborCost: number;
  profitCost: number;
  total: number;
  status: QuoteStatus;
}

export const QuotePDF = forwardRef<HTMLDivElement, QuotePDFProps>(function QuotePDF(props, ref) {
  return (
    <div ref={ref} className="w-[900px] bg-white p-10 text-black">
      <div className="flex justify-between">
        <div>
          <div className="text-2xl font-bold">Mueblería Rene</div>
          <div className="text-sm text-zinc-500">Cotización profesional</div>
        </div>
        <div className="text-right text-sm">
          <div>{new Date().toLocaleDateString('es-MX')}</div>
          <div>Folio: COT-{props.folio}</div>
          <div>Estatus: {props.status}</div>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
        <div>
          <h3 className="border-b pb-2 text-base font-semibold">Datos del cliente</h3>
          <p className="mt-3">Nombre: {props.project.clientName}</p>
          <p>Teléfono: {props.project.clientPhone}</p>
        </div>
        <div>
          <h3 className="border-b pb-2 text-base font-semibold">Proyecto</h3>
          <p className="mt-3">Nombre: {props.project.projectName}</p>
          <p>Tipo: {props.project.type}</p>
          <p>Medidas: {props.project.width} × {props.project.height} × {props.project.depth} cm</p>
          <p>Válida hasta: {props.validUntil}</p>
        </div>
      </div>
      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            {['Material', 'Cant.', 'Unid.', 'P.Unit.', 'Total'].map((label) => <th key={label} className="py-2">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {props.materials.map((item) => (
            <tr key={item.description} className="border-b">
              <td className="py-3">{item.material}</td>
              <td>{item.quantity}</td>
              <td>{item.unit}</td>
              <td>{formatCurrency(item.unitCost)}</td>
              <td>{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 ml-auto w-72 space-y-2 text-sm">
        <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(props.subtotalMaterials)}</span></div>
        <div className="flex justify-between"><span>Mano de obra:</span><span>{formatCurrency(props.laborCost)}</span></div>
        <div className="flex justify-between"><span>Utilidad:</span><span>{formatCurrency(props.profitCost)}</span></div>
        <div className="flex justify-between border-t pt-2 text-lg font-semibold"><span>TOTAL:</span><span>{formatCurrency(props.total)}</span></div>
      </div>
      <p className="mt-10 text-sm text-zinc-500">Nota: Cotización válida por 15 días.</p>
    </div>
  );
});
