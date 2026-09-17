// Screen 6 (PDF) — premium day card. Per TRIPOLY_HANDOFF.md section 7 (Screen 6 spec):
// photo + day label + Playfair title + prose description + hotel + meal pills + activities
// + tip box. Deliberately a separate component from ItineraryDayCard (Screen 5) — the PDF
// card has a photo, a prose description, and differently-colored pills/bullets that the
// in-app itinerary card doesn't, matching the mockup's Screen 6 markup exactly rather than
// forcing one component to serve two different visual specs.

import type { DayPlan } from "@/store/useTripStore";
import { StarRating } from "@/components/ui/StarRating";

export function PdfDayCard({ day }: { day: DayPlan }) {
  return (
    <div className="mx-4 mb-4 overflow-hidden rounded-2xl bg-white shadow-tripoly-card">
      {/* bg-white is a required opaque base (not decoration) — this card sits in front of the
          world-map watermark, and the gradient alone (all translucent stops) would let it bleed
          through as mottled blobs instead of a clean placeholder. day.photo is set server-side
          (app/api/generate-itinerary + lib/unsplash.ts) and can be absent (lookup failed, no
          result, or key not configured) — falls back to the same gradient either way. */}
      <div className="relative h-[140px] w-full bg-white">
        {day.photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={day.photo.url} alt={day.location} className="absolute inset-0 h-full w-full object-cover" />
            {/* Photographer credit — required by Unsplash's API attribution guideline for every
                displayed photo, same as the Home-screen cards (DestinationCard/BentoTile). */}
            <a
              href={day.photo.photographerProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-1.5 right-2 font-sans text-[8px] leading-none text-white/75 hover:text-white"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              📷 {day.photo.photographerName} / Unsplash
            </a>
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
        )}
      </div>

      <div className="p-4">
        <div className="font-sans text-[10px] font-semibold uppercase tracking-[1px] text-tripoly-green">
          Day {day.day}
        </div>
        <div className="mt-1 font-serif text-[17px] font-bold text-black">{day.title}</div>
        <div className="mt-1.5 font-sans text-[13px] leading-[1.6] text-[#555]">{day.day_description}</div>

        <div className="mt-2 font-sans text-[13px] text-[#333]">
          🏨 {day.hotel.name} · <StarRating stars={day.hotel.stars} />
        </div>

        <div className="mt-1.5 flex gap-1.5">
          <span className="rounded-[10px] bg-tripoly-muted px-2.5 py-1 font-sans text-[10px] font-semibold text-tripoly-accent">
            🍳 Breakfast
          </span>
          <span className="rounded-[10px] bg-tripoly-muted px-2.5 py-1 font-sans text-[10px] font-semibold text-tripoly-accent">
            🥗 Lunch
          </span>
          <span className="rounded-[10px] bg-tripoly-muted px-2.5 py-1 font-sans text-[10px] font-semibold text-tripoly-accent">
            🍽️ Dinner
          </span>
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-tripoly-green" />
            <div className="font-sans text-[13px] text-[#333]">Morning: {day.activities.morning}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-tripoly-green" />
            <div className="font-sans text-[13px] text-[#333]">Afternoon: {day.activities.afternoon}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-tripoly-green" />
            <div className="font-sans text-[13px] text-[#333]">Evening: {day.activities.evening}</div>
          </div>
        </div>

        <div className="mt-2.5 rounded-lg border-l-[3px] border-tripoly-tip-border bg-tripoly-tip-bg px-3 py-2.5">
          <div className="font-sans text-[12px] italic text-[#7A6200]">💡 {day.tip}</div>
        </div>
      </div>
    </div>
  );
}
