import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { listQuotes } from "@/services/api";

export default async function QuotesPage() {
  const quotes = await listQuotes();
  return (
    <AppShell title="Cotizaciones" subtitle="Seguimiento comercial por folio y proyecto">
      <Card>
        <div className="mb-5">
          <h3 className="text-xl font-semibold">Listado de cotizaciones</h3>
          <p className="text-sm text-zinc-400">Estados: borrador, enviada, aprobada o rechazada.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-zinc-400">
              <tr>{['Folio', 'Cliente', 'Proyecto', 'Estado', 'Total', 'Acción'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="border-t border-white/6">
                  <td className="px-4 py-4 font-medium text-white">{quote.folio}</td>
                  <td className="px-4 py-4 text-zinc-300">{quote.project.clientName}</td>
                  <td className="px-4 py-4 text-zinc-300">{quote.project.projectName}</td>
                  <td className="px-4 py-4"><Badge tone={quote.status === 'Aprobada' ? 'emerald' : quote.status === 'Enviada' ? 'amber' : 'zinc'}>{quote.status}</Badge></td>
                  <td className="px-4 py-4 text-zinc-300">{formatCurrency(quote.total)}</td>
                  <td className="px-4 py-4"><Link href={`/projects/${quote.project.id}/quote`} className="text-indigo-200 hover:text-white">Ver cotización</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
