// PDF generation helpers (html2canvas + jsPDF) — Step 10. See TRIPOLY_HANDOFF.md section 11.
//
// Flow: capture the print-layout DOM node as a canvas, then slice that canvas across as
// many A4 pages as the itinerary needs. A single "2 lakhs, 2 nights" trip fits one page,
// but the validation rules allow up to 10 nights, which routinely runs to several pages —
// so pagination is a required part of this, not an edge case.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export async function generateItineraryPdf(element: HTMLElement, filename: string): Promise<void> {
  // Using html2canvas-pro (not upstream html2canvas) — a drop-in, actively-maintained fork.
  // Plain html2canvas throws "Attempting to parse an unsupported color function 'oklab'" on
  // this element, because Tailwind v4 compiles gradient/opacity utilities using oklab under
  // the hood and upstream html2canvas's CSS parser predates CSS Color 4 support. Confirmed
  // with you before making this swap — see Step 10 notes.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const canvas = await html2canvas(element, {
    scale: 2, // sharper output than a 1:1 capture
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  // No external image URLs are used anywhere in this layout (photo areas are CSS
  // gradients), so there's nothing for html2canvas to fail to load cross-origin.
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const imgWidthMm = A4_WIDTH_MM;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  let heightLeft = imgHeightMm;
  let positionMm = 0;

  pdf.addImage(imgData, "PNG", 0, positionMm, imgWidthMm, imgHeightMm);
  heightLeft -= A4_HEIGHT_MM;

  while (heightLeft > 0) {
    positionMm -= A4_HEIGHT_MM;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, positionMm, imgWidthMm, imgHeightMm);
    heightLeft -= A4_HEIGHT_MM;
  }

  pdf.save(filename);
}

// "Tripoly_Itinerary_Kaushik_Bali.pdf" — strip characters that aren't filename-safe and
// collapse whitespace, since name/destination are free-text user input.
export function buildPdfFilename(name: string, destination: string): string {
  const clean = (s: string) =>
    s
      .trim()
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_");
  return `Tripoly_Itinerary_${clean(name) || "Trip"}_${clean(destination) || "Destination"}.pdf`;
}
