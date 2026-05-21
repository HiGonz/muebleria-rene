"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { MaterialsTable } from "@/components/quotes/MaterialsTable";
import { QuotePDF } from "@/components/quotes/QuotePDF";
import { QuoteSummary } from "@/components/quotes/QuoteSummary";
import { generateQuoteFileName } from "@/lib/utils";
import { getQuote } from "@/services/api";
import { quoteTotals, type MaterialItem } from "@/services/materialCalculator";

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getQuote>> | null>(null);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [laborPercentage, setLaborPercentage] = useState(30);
  const [profitPercentage, setProfitPercentage] = useState(20);
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    params.then(async ({ id }) => {
      const nextQuote = await getQuote(id);
      setQuote(nextQuote);
      setItems(nextQuote.materials);
      setLaborPercentage(nextQuote.laborPercentage);
      setProfitPercentage(nextQuote.profitPercentage);
    });
  }, [params]);

  const totals = useMemo(() => quoteTotals(items, laborPercentage, profitPercentage), [items, laborPercentage, profitPercentage]);

  if (!quote) {
    return <AppShell title="Cotización" subtitle="Cargando cotización"><Card>Cargando...</Card></AppShell>;
  }

  return (
    <AppShell title={`Cotización ${quote.folio}`} subtitle={`Proyecto ${quote.project.projectName}`}>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_420px]">
        <Card>
          <div className="mb-5">
            <h3 className="text-xl font-semibold">Materiales editables</h3>
            <p className="text-sm text-zinc-400">Ajusta cantidades manualmente y recalcula la propuesta.</p>
          </div>
          <MaterialsTable
            items={items}
            onChange={(index, quantity) => {
              setItems((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, quantity, subtotal: Number((quantity * item.unitCost).toFixed(2)) } : item));
            }}
          />
        </Card>
        <QuoteSummary
          status={quote.status}
          subtotalMaterials={totals.subtotalMaterials}
          laborPercentage={laborPercentage}
          profitPercentage={profitPercentage}
          laborCost={totals.laborCost}
          profitCost={totals.profitCost}
          total={totals.total}
          onLaborChange={setLaborPercentage}
          onProfitChange={setProfitPercentage}
          onGeneratePdf={async () => {
            if (!pdfRef.current) return;
            const canvas = await html2canvas(pdfRef.current, { scale: 2, backgroundColor: '#ffffff' });
            const imageData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = (canvas.height * pageWidth) / canvas.width;
            pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight);
            pdf.save(generateQuoteFileName(quote.folio, quote.project.clientName));
          }}
        />
      </div>
      <div className="pointer-events-none absolute -left-[9999px] top-0">
        <QuotePDF ref={pdfRef} {...quote} {...totals} materials={items} />
      </div>
    </AppShell>
  );
}
