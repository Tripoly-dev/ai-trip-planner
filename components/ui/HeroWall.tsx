"use client";

// Welcome screen (app/page.tsx) — full-bleed version of the same two-column scrolling
// wall effect built for Home (components/ui/DestinationWall). Same mechanism (the
// wallScrollDown/wallScrollUp keyframes in globals.css, columns duplicated for a
// seamless loop) but styled as a true background layer rather than a rounded card: no
// container corners, no white edge-fade (this app's Welcome screen is a dark surface,
// not white), no per-tile name label (the actual headline text sits on top of this, a
// second row of tile labels would just compete with it). Deliberately a separate
// component from DestinationWall rather than one component with a pile of variant
// props — the two really are styled differently enough that sharing one component
// would mean more conditional branching than code actually saved.
//
// Sits behind app/page.tsx's existing dark gradient overlay (kept, for headline
// legibility) — that overlay needed `pointer-events-none` added so clicks reach this
// wall's photographer-credit links underneath it; see the comment there.

import type { BentoDestination } from "@/lib/constants";
import { UNSPLASH_ATTRIBUTION_URL } from "@/lib/constants";

function splitColumns(photos: BentoDestination[]): [BentoDestination[], BentoDestination[]] {
  const left: BentoDestination[] = [];
  const right: BentoDestination[] = [];
  photos.forEach((photo, i) => (i % 2 === 0 ? left : right).push(photo));
  return [left, right];
}

function WallColumn({ photos, direction }: { photos: BentoDestination[]; direction: "down" | "up" }) {
  // Duplicated once — the CSS loop is exactly a 50%-of-total-height cycle, so two
  // copies is the minimum (and correct amount) for a seamless loop.
  const doubled = [...photos, ...photos];
  const animationClass = direction === "down" ? "home-wall-col-down" : "home-wall-col-up";

  return (
    <div className="relative h-full flex-1 overflow-hidden">
      <div className={`flex flex-col gap-1.5 ${animationClass}`}>
        {doubled.map((photo, i) => (
          <div key={`${photo.id}-${i}`} className="relative h-[220px] w-full flex-shrink-0 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.imageUrl} alt={photo.name} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/20" />
            <a
              href={photo.photographerProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-1 right-1.5 font-sans text-[7px] leading-none text-white/50 hover:text-white/80"
            >
              {photo.photographerName}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroWall({ photos }: { photos: BentoDestination[] }) {
  const [left, right] = splitColumns(photos);

  return (
    <div className="absolute inset-0">
      <div className="flex h-full gap-1.5">
        <WallColumn photos={left} direction="down" />
        <WallColumn photos={right} direction="up" />
      </div>
      {/* Only a top fade — the stronger black gradient already layered on top in
          page.tsx (from-black/5 via-black/10 to-black/75) handles the bottom half's
          legibility against the headline/CTA. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 to-transparent" />
      <a
        href={UNSPLASH_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-x-0 bottom-1.5 z-10 text-center font-sans text-[9px] text-white/40 hover:text-white/70"
      >
        Photos via Unsplash
      </a>
    </div>
  );
}
