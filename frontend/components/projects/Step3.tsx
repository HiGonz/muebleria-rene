import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { getDraftMaterials, getDraftQuote, type ProjectDraft } from "@/store/useProjectStore";

export function Step3({ draft }: { draft: ProjectDraft }) {
  const materials = getDraftMaterials(draft);
  const totals = getDraftQuote(draft);

  return (
    <div className="space-y-5">
      <Card>
        <h4 className="text-lg font-semibold">Resumen del proyecto</h4>
        <div className="mt-4 grid gap-3 text-sm text-zinc-300 md:grid-cols-2">
          <div>Cliente: <span className="font-medium text-white">{draft.clientName || 'Sin definir'}</span></div>
          <div>Proyecto: <span className="font-medium text-white">{draft.projectName || 'Sin definir'}</span></div>
          <div>Tipo: <span className="font-medium text-white">{draft.type}</span></div>
          <div>Medidas: <span className="font-medium text-white">{draft.width} × {draft.height} × {draft.depth} cm</span></div>
        </div>
      </Card>
      <Card>
        <h4 className="text-lg font-semibold">Materiales calculados</h4>
        <div className="mt-4 space-y-3 text-sm">
          {materials.map((item) => (
            <div key={item.description} className="flex items-center justify-between rounded-xl border border-white/6 bg-white/4 px-4 py-3">
              <div>
                <p className="font-medium text-white">{item.material}</p>
                <p className="text-zinc-400">{item.description}</p>
              </div>
              <div className="text-right">
                <p className="text-zinc-300">{item.quantity} {item.unit}</p>
                <p className="font-semibold text-white">{formatCurrency(item.subtotal)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">Cotización estimada</p>
          <p className="mt-1 text-3xl font-semibold">{formatCurrency(totals.total)}</p>
        </div>
        <div className="text-right text-sm text-zinc-400">
          <div>Materiales: {formatCurrency(totals.subtotalMaterials)}</div>
          <div>Mano de obra: {formatCurrency(totals.laborCost)}</div>
          <div>Utilidad: {formatCurrency(totals.profitCost)}</div>
        </div>
      </Card>
    </div>
  );
}
