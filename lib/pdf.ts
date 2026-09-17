// PDF generation helpers (html2canvas + jsPDF) — Step 10. See TRIPOLY_HANDOFF.md section 11.
//
// Flow: capture the print-layout DOM node as a single canvas (one capture — this keeps the
// world-map watermark and every gradient/photo pixel-identical to what's on screen, with no
// risk of a per-section re-render drifting from it), then lay that canvas across as many A4
// pages as the itinerary needs. A single "2 lakhs, 2 nights" trip fits one page, but the
// validation rules allow up to 10 nights, which routinely runs to several pages — so
// pagination is a required part of this, not an edge case.
//
// Page-break placement (your call, confirmed): the original version sliced at a fixed 297mm
// every time, which cut through headings, images, and cards wherever that line happened to
// fall (e.g. a day's title split across two pages, a photo cut in half at a page boundary).
// Fix: every element marked `data-pdf-section` in the captured tree (PdfScreen's hero, trip
// overview strip, and footer; PdfDayCard's card root) is measured BEFORE the canvas capture,
// as a fraction of the element's total height — fractions rather than raw pixels/mm so this
// never has to assume html2canvas's internal scale factor matches a separate DOM measurement.
// Each page break then snaps back to the nearest section boundary at or before the 297mm
// limit, instead of the limit itself. The "unused" bottom sliver of a page (between where
// content actually ends and the fixed 297mm line) is painted white so none of the next
// section leaks through — jsPDF's addImage always draws the FULL image, just shifted up by
// `positionMm`, and clips at the page edge, so it doesn't know we only want part of it shown.
// The next page then starts exactly where this one left off, so nothing is skipped or
// duplicated — pages just end up variable-height instead of always exactly 297mm, which is
// normal for a real print layout. Falls back to a hard cut at the 297mm limit only when a
// single section is taller than a full page on its own (rare) — strictly no worse than what
// every page did before this change.

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Each marked section's bottom edge as a fraction (0-1) of the captured element's total height. */
function measureSectionBreakFractions(element: HTMLElement): number[] {
  const containerRect = element.getBoundingClientRect();
  if (containerRect.height <= 0) return [];

  const sections = Array.from(element.querySelectorAll<HTMLElement>("[data-pdf-section]"));
  const fractions = sections
    .map((section) => (section.getBoundingClientRect().bottom - containerRect.top) / containerRect.height)
    // Excludes 0 (nothing above it to protect) and >=1 (the true end — the pagination loop
    // below already finishes cleanly there without needing a break point).
    .filter((f) => f > 0 && f < 1);

  return fractions.sort((a, b) => a - b);
}

export async function generateItineraryPdf(element: HTMLElement, filename: string): Promise<void> {
  // Using html2canvas-pro (not upstream html2canvas) — a drop-in, actively-maintained fork.
  // Plain html2canvas throws "Attempting to parse an unsupported color function 'oklab'" on
  // this element, because Tailwind v4 compiles gradient/opacity utilities using oklab under
  // the hood and upstream html2canvas's CSS parser predates CSS Color 4 support. Confirmed
  // with you before making this swap — see Step 10 notes.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  // Measured before the capture — html2canvas doesn't mutate the live DOM (it renders from an
  // internal clone), so this reflects the exact same layout the capture below will produce.
  const breakFractions = measureSectionBreakFractions(element);

  const canvas = await html2canvas(element, {
    scale: 2, // sharper output than a 1:1 capture
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  // JPEG at 0.8 quality instead of lossless PNG — PNG was the main driver of the
  // ~24MB file size (a full-resolution 2x-scale screenshot has no flat-color/vector
  // content that would benefit from lossless encoding, and now that the layout also
  // carries real photos, JPEG is the more appropriate format for photographic content
  // anyway). jsPDF's `compress: true` adds further stream compression on top.
  const imgData = canvas.toDataURL("image/jpeg", 0.8);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const imgWidthMm = A4_WIDTH_MM;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
  const safeBreaksMm = breakFractions.map((f) => f * imgHeightMm);

  let pageStartMm = 0;
  let firstPage = true;

  while (pageStartMm < imgHeightMm) {
    const hardLimitMm = pageStartMm + A4_HEIGHT_MM;
    const remainingMm = imgHeightMm - pageStartMm;

    let pageEndMm: number;
    if (remainingMm <= A4_HEIGHT_MM) {
      // Everything left fits on this one page — nothing to break.
      pageEndMm = imgHeightMm;
    } else {
      const safeBreak = safeBreaksMm.filter((y) => y > pageStartMm + 1 && y <= hardLimitMm).pop();
      pageEndMm = safeBreak ?? hardLimitMm;
    }

    if (!firstPage) pdf.addPage();
    firstPage = false;

    pdf.addImage(imgData, "JPEG", 0, -pageStartMm, imgWidthMm, imgHeightMm);

    const pageContentHeightMm = pageEndMm - pageStartMm;
    if (pageContentHeightMm < A4_HEIGHT_MM) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, pageContentHeightMm, A4_WIDTH_MM, A4_HEIGHT_MM - pageContentHeightMm, "F");
    }

    pageStartMm = pageEndMm;
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
