"use client";

// Screen 02 — Home. Originally two mockup variants (02A returning-user "Upcoming
// Journey" card / 02B new-user Bento mosaic), switched on whether the Zustand store had
// an itinerary. That split is gone now, at your request: the store never actually
// distinguished a "returning" user from a "new" one in any durable sense — itinerary was
// plain in-memory state with no persistence, so it only meant "hasn't refreshed the tab
// yet." One unified layout now, for everyone: the new scrolling destination wall, a
// compact "continue" prompt when there IS a current trip (in addition to, not instead of,
// the wall), then the same CTA / Fun Facts / "Where to next?" carousel as before,
// untouched.
//
// Every generated trip is now saved to the Trips tab (useTripStore.ts's savedTrips,
// localStorage-persisted) — that's the durable "your trips" surface; this compact prompt
// is just a shortcut back to whichever one you were most recently looking at.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BottomNav, DESKTOP_SIDEBAR_WIDTH_CLASS } from "@/components/ui/BottomNav";
import { DestinationCard } from "@/components/ui/DestinationCard";
import { DestinationWall } from "@/components/ui/DestinationWall";
import { FunFactCard } from "@/components/ui/FunFactCard";
import { DESTINATION_CAROUSEL, FUN_FACTS, WALL_DESTINATIONS } from "@/lib/constants";
import { useTripStore } from "@/store/useTripStore";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function ContinueTripPrompt() {
  const itinerary = useTripStore((s) => s.itinerary);
  if (!itinerary) return null;

  const { trip_summary: summary } = itinerary;

  return (
    <Link
      href="/itinerary"
      className="mb-4 flex h-[68px] items-center gap-3 rounded-2xl border border-tripoly-border bg-white px-3 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
    >
      <div className="relative h-[46px] w-[46px] flex-shrink-0 overflow-hidden rounded-xl">
        {summary.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={summary.photo.url} alt={summary.destination} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-sans text-[10px] font-semibold uppercase tracking-wide text-tripoly-green">
          Continue planning
        </div>
        <div className="truncate font-sans text-[14px] font-bold text-tripoly-text">
          {summary.destination} · {summary.duration_nights} nights
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="#BDBDBD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

function FunFactCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Card width (320px, per FunFactCard) + gap (10px) — used both to derive which card is
  // nearest the left edge as the user scrolls (dot indicator) and to auto-advance below.
  const STEP = 330;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const index = Math.round(el.scrollLeft / STEP);
    setActiveIndex(Math.min(Math.max(index, 0), FUN_FACTS.length - 1));
  }

  // Auto-advance, per your live-portal feedback ("there is not auto scrolling feature").
  // Reads/writes activeIndex through the functional setState updater so it always
  // continues from wherever the user last manually scrolled to (handleScroll above keeps
  // activeIndex in sync with that), rather than a stale value captured at mount. Desktop
  // renders these as a static wrapping grid (no scroller to advance), so this is a no-op
  // there beyond the harmless state updates.
  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % FUN_FACTS.length;
        scrollerRef.current?.scrollTo({ left: next * STEP, behavior: "smooth" });
        return next;
      });
    }, 4000);
    return () => clearInterval(id);
  }, [STEP]);

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

        <ContinueTripPrompt />

        <DestinationWall photos={WALL_DESTINATIONS} />

        <Link
          href="/chat"
          className="home-cta-pulse mb-5 flex h-14 items-center justify-center rounded-2xl bg-tripoly-green font-sans text-base font-semibold text-white transition-transform active:scale-[0.97]"
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
