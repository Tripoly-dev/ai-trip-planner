"use client";

// Screen 02A (Returning User) / 02B (New User) — Home.
// Per TRIPOLY_HANDOFF.md section 7. Which variant renders is decided exactly as the
// handoff doc specifies: "check Zustand store for existing itinerary."
//
// Known simplification: 02A's mockup shows a green "in 24 days" countdown badge on the
// Journey card. There's no real trip-start date in the data model yet (trip_summary only
// carries a free-text `dates_suggested` string, and persisted/saved trips are explicitly
// Phase 2 — section 18) — so rather than fabricate a day count, the badge shows the
// itinerary's duration instead. Revisit once Phase 2 adds real trip dates.

import { useRef, useState } from "react";
import Link from "next/link";
import { BottomNav, DESKTOP_SIDEBAR_WIDTH_CLASS } from "@/components/ui/BottomNav";
import { DestinationCard } from "@/components/ui/DestinationCard";
import { FunFactCard } from "@/components/ui/FunFactCard";
import {
  BENTO_ROW_1,
  BENTO_ROW_2,
  DESTINATION_CAROUSEL,
  FUN_FACTS,
  UNSPLASH_ATTRIBUTION_URL,
  type BentoDestination,
} from "@/lib/constants";
import { useTripStore } from "@/store/useTripStore";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Attribution kept to a photographer-only initial-cap tag (not the full "Photo by X on
// Unsplash" wording DestinationCard uses) — these tiles run as small as 76px tall, no room
// for two linked labels without it reading as visual noise. Still real credit + a real link
// back to their Unsplash profile, satisfying the same guideline as DestinationCard.
function BentoTile({ name, imageUrl, photographerName, photographerProfileUrl, className }: BentoDestination & { className: string }) {
  return (
    <div className={`relative flex-shrink-0 overflow-hidden rounded-lg ${className}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 from-50% to-black/60" />
      {imageUrl && (
        <a
          href={photographerProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-1.5 top-1.5 font-sans text-[7px] leading-none text-white/55 hover:text-white/85"
        >
          {photographerName}
        </a>
      )}
      <div className="absolute bottom-1.5 left-2 font-sans text-[10px] font-semibold text-white">{name}</div>
    </div>
  );
}

function FunFactCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Card width (295px, per FunFactCard) + gap (10px) — used to derive which card is
  // nearest the left edge as the user scrolls, to drive the dot indicator.
  const STEP = 305;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / STEP);
    setActiveIndex(Math.min(Math.max(index, 0), FUN_FACTS.length - 1));
  }

  return (
    <div className="mb-5">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar -mr-5 flex gap-2.5 overflow-x-auto lg:mr-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible"
      >
        {FUN_FACTS.map((fact) => (
          <FunFactCard key={fact.id} text={fact.text} />
        ))}
      </div>
      {/* Dots track horizontal scroll position — meaningless once cards are a wrapping grid. */}
      <div className="mt-2.5 mb-6 flex items-center justify-center gap-1.5 lg:hidden">
        {FUN_FACTS.map((fact, i) => (
          <div
            key={fact.id}
            className={
              i === activeIndex
                ? "h-1.5 w-3.5 rounded-full bg-tripoly-green"
                : "h-1.5 w-1.5 rounded-full bg-[#DADADA]"
            }
          />
        ))}
      </div>
    </div>
  );
}

export function HomeScreen() {
  const name = useTripStore((s) => s.name);
  const itinerary = useTripStore((s) => s.itinerary);
  const hasSavedTrip = itinerary !== null;

  const displayName = name || "Traveler";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <main className={`relative min-h-dvh bg-white pb-24 lg:pb-10 ${DESKTOP_SIDEBAR_WIDTH_CLASS}`}>
      <div className="px-5 pt-6 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-10">
        {/* Greeting row */}
        <div className="mb-[22px] flex items-center justify-between">
          <div>
            <div className="font-sans text-[13px] font-medium text-tripoly-text-muted">{getGreeting()}</div>
            <div className="font-sans text-[22px] font-bold text-tripoly-text">{displayName}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tripoly-green font-sans text-base font-bold text-white">
            {avatarLetter}
          </div>
        </div>

        {hasSavedTrip && itinerary ? (
          // Screen 02A — Upcoming Journey card
          <Link
            href="/itinerary"
            className="relative mb-5 block h-[190px] overflow-hidden rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/70" />
            <div className="absolute right-3.5 top-3.5 rounded-xl bg-tripoly-green px-3 py-1.5 font-sans text-[11px] font-semibold text-white">
              {itinerary.trip_summary.duration_nights} nights
            </div>
            <div className="absolute inset-x-4 bottom-4 flex items-end justify-between">
              <div>
                <div className="font-sans text-[19px] font-bold text-white">
                  {itinerary.trip_summary.destination}
                </div>
                <div className="mt-0.5 font-sans text-[13px] text-white/90">
                  {itinerary.trip_summary.dates_suggested}
                </div>
              </div>
              <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/25">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </Link>
        ) : (
          // Screen 02B — Bento mosaic for new users
          <>
            <div className="mb-5 flex flex-col gap-1 overflow-hidden rounded-[20px]">
              <div className="flex h-[110px] gap-1">
                <BentoTile {...BENTO_ROW_1[0]} className="w-[42%]" />
                <BentoTile {...BENTO_ROW_1[1]} className="w-[29%]" />
                <BentoTile {...BENTO_ROW_1[2]} className="w-[29%]" />
              </div>
              <div className="flex h-[76px] gap-1">
                <BentoTile {...BENTO_ROW_2[0]} className="flex-1" />
                <BentoTile {...BENTO_ROW_2[1]} className="flex-1" />
                <BentoTile {...BENTO_ROW_2[2]} className="flex-1" />
              </div>
            </div>
            <div className="text-center font-sans text-[13px] text-tripoly-text-muted">
              Where will your story begin?
            </div>
            {/* One shared Unsplash link for the whole mosaic — each tile above already credits
                its own photographer; this covers the "link to Unsplash itself" half of the same
                attribution guideline without repeating it six times. */}
            <a
              href={UNSPLASH_ATTRIBUTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-5 block text-center font-sans text-[10px] text-tripoly-text-muted/70 hover:text-tripoly-text-muted"
            >
              Photos via Unsplash
            </a>
          </>
        )}

        <Link
          href="/chat"
          className="mb-5 flex h-14 items-center justify-center rounded-2xl bg-tripoly-green font-sans text-base font-semibold text-white shadow-[0_4px_20px_rgba(22,207,118,0.25)]"
        >
          Plan a Trip ✈️
        </Link>

        <FunFactCarousel />

        <div className="mb-3 font-sans text-[15px] font-bold text-tripoly-text">Where to next?</div>
        <div className="no-scrollbar -mr-5 flex gap-3 overflow-x-auto lg:mr-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible">
          {DESTINATION_CAROUSEL.map((d) => (
            <DestinationCard
              key={d.id}
              name={d.name}
              tagline={d.tagline}
              imageUrl={d.imageUrl}
              credit={{ photographerName: d.photographerName, photographerProfileUrl: d.photographerProfileUrl }}
            />
          ))}
        </div>
      </div>

      <BottomNav active="home" />
    </main>
  );
}
