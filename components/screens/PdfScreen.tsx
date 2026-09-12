"use client";

// Screen 6 — PDF Preview. Per TRIPOLY_HANDOFF.md section 7 (Screen 6 spec) and section 11
// (PDF generation). No app chrome per spec: no nav bar, no mic, no amendment bar — the only
// interactive element is the Download button.
//
// Decisions confirmed with you before building:
//  - Hero + day-card photo areas are gradient placeholders, matching the convention already
//    used everywhere else in the app (DestinationCard, itinerary map) — there's no image
//    API/key anywhere in the handoff to source real photos from.
//  - The world-map watermark is a hand-built abstract SVG (no maps asset exists in the
//    project), tiled as a repeating pattern so it holds up at any page length.
//  - Multi-page PDF export: itineraries can run up to 10 nights (section 8's validation
//    rules), which won't fit one A4 page, so lib/pdf.ts slices the captured canvas across
//    as many pages as needed.
//
// The Download button lives outside contentRef (the element that gets captured into the
// PDF) so a dead, non-functional button never ends up baked into the exported file.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTripStore } from "@/store/useTripStore";
import { TripolyMark } from "@/components/ui/TripolyMark";
import { PdfDayCard } from "@/components/ui/PdfDayCard";
import { WorldMapWatermark } from "@/components/ui/WorldMapWatermark";
import { generateItineraryPdf, buildPdfFilename } from "@/lib/pdf";

export function PdfScreen() {
  const router = useRouter();
  const itinerary = useTripStore((s) => s.itinerary);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!itinerary) {
      router.replace("/home");
    }
  }, [itinerary, router]);

  if (!itinerary) {
    return null;
  }

  const { trip_summary: summary, days } = itinerary;

  async function handleDownload() {
    if (!contentRef.current) return;
    setIsDownloading(true);
    setDownloadError(false);
    try {
      await generateItineraryPdf(contentRef.current, buildPdfFilename(summary.name, summary.destination));
    } catch (err) {
      console.error("PDF generation failed:", err);
      setDownloadError(true);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#fafafa] pb-10 pt-6 lg:py-16">
      {/* Desktop "A4 centered, max-width 794px" (section 13) — a page mat around the actual
          captured content, not a resize of it. contentRef (below) is what html2canvas
          captures for the downloaded PDF, and it stays a fixed 430px on every device so the
          exported file is identical regardless of what screen it was downloaded from —
          confirmed with you, since Step 10 already verified that output. */}
      <div className="lg:mx-auto lg:max-w-[794px] lg:rounded-3xl lg:bg-white lg:p-12 lg:shadow-tripoly-card">
      <div
        ref={contentRef}
        className="relative mx-auto max-w-[430px] overflow-hidden bg-white shadow-tripoly-card"
      >
        <WorldMapWatermark />

        <div className="relative">
          {/* Hero */}
          <div className="relative h-[260px] flex-shrink-0">
            {/* bg-white here is a required opaque base, not decoration — this sits in front of the
                world-map watermark, and the gradient alone (all translucent stops) would let it
                bleed through as mottled blobs instead of a clean placeholder. */}
            <div className="absolute inset-0 bg-white bg-gradient-to-br from-tripoly-green/40 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/[0.05] from-40% to-black/[0.72]" />
            <div className="absolute left-5 top-5 flex items-center gap-2">
              <TripolyMark variant="white" size={20} />
              <div className="font-sans text-base font-extrabold text-white">tripoly</div>
            </div>
            <div className="absolute inset-x-5 bottom-5">
              <div className="font-serif text-[26px] font-bold text-white">
                {summary.name}&apos;s {summary.destination} Escape
              </div>
              <div className="mt-1.5 font-sans text-[13px] text-white/90">
                {summary.duration_nights} Nights · {summary.group_type} of {summary.traveler_count} ·{" "}
                {summary.dates_suggested} · ₹{summary.total_budget.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Trip overview strip */}
          <div className="flex justify-between border-b border-tripoly-border px-5 py-4">
            <div>
              <div className="font-sans text-[10px] font-medium text-tripoly-text-muted">Dates</div>
              <div className="mt-[3px] font-sans text-sm font-semibold text-black">
                {summary.dates_suggested}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] font-medium text-tripoly-text-muted">Travelers</div>
              <div className="mt-[3px] font-sans text-sm font-semibold text-black">
                {summary.traveler_count} ({summary.group_type})
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] font-medium text-tripoly-text-muted">Total Budget</div>
              <div className="mt-[3px] font-sans text-sm font-semibold text-black">
                ₹{summary.total_budget.toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div className="font-sans text-[10px] font-medium text-tripoly-text-muted">Per Person</div>
              <div className="mt-[3px] font-sans text-sm font-semibold text-black">
                ₹{summary.per_person_budget.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Day cards */}
          <div className="pt-5">
            {days.map((day) => (
              <PdfDayCard key={day.day} day={day} />
            ))}
          </div>

          {/* Footer credit line — captured. The button below it is not. */}
          <div className="px-5 pb-6 pt-2 text-center">
            <div className="font-sans text-[13px] text-tripoly-text-muted">
              Planned with ❤️ by Tripoly | tripoly.in
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[430px] px-5 pt-4 text-center">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="inline-flex items-center justify-center rounded-2xl border-[1.5px] border-tripoly-green bg-white px-7 py-3 font-sans text-[13px] font-semibold text-tripoly-green disabled:opacity-60"
        >
          {isDownloading ? "Preparing PDF…" : "⬇ Download PDF"}
        </button>
        {downloadError && (
          <div className="mt-2 font-sans text-xs text-tripoly-error">
            Something went wrong generating the PDF. Please try again.
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
