// html2canvas 1.4.1 can't parse the oklch()/lab() colors Tailwind v4 generates
// for the app's stylesheet, so this uses the html2canvas-pro fork which adds
// support for modern CSS color functions.
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

// A4 at 96dpi — matches the fixed width used by KitchenReportPDF's page divs.
const PAGE_W_PT = 595.28;
const PAGE_H_PT = 841.89;
const MARGIN_PT = 24;

/**
 * Rasterizes every `[data-pdf-page]` child of `container` and lays each one
 * out as its own PDF page, scaled to fit within the page margins without
 * cropping (shrinks to fit on either axis, whichever is the tighter fit).
 */
export async function exportKitchenReportPDF(container: HTMLElement, fileName: string) {
  const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"));
  if (pages.length === 0) return;

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const usableW = PAGE_W_PT - MARGIN_PT * 2;
  const usableH = PAGE_H_PT - MARGIN_PT * 2;

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff" });
    const imageData = canvas.toDataURL("image/png");

    const scale = Math.min(usableW / canvas.width, usableH / canvas.height);
    const imgW = canvas.width * scale;
    const imgH = canvas.height * scale;
    const x = MARGIN_PT + (usableW - imgW) / 2;
    const y = MARGIN_PT;

    if (i > 0) pdf.addPage();
    pdf.addImage(imageData, "PNG", x, y, imgW, imgH);
  }

  pdf.save(fileName);
}
