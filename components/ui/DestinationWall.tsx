"use client";

// Home screen — two-column, opposite-direction scrolling image wall (new; not part of
// the original TRIPOLY_HANDOFF.md mockup, added per your Netflix-style request). Left
// column drifts top-to-bottom, right column bottom-to-top, continuously — pure CSS
// (@keyframes wallScrollDown/wallScrollUp in globals.css), no animation library needed
// (none is installed). Each column's photo list is duplicated once so the loop has no
// visible seam — see the comment above those keyframes for why.
//
// Attribution follows the same pattern already used for the Bento mosaic (HomeScreen's
// BentoTile): a small per-tile photographer-only link (full "Photo by X on Unsplash"
// wording doesn't fit a 150px tile), plus one shared "Photos via Unsplash" link below the
// whole wall — together satisfying Unsplash's API attribution guideline (credit the
// photographer + link to their profile + link to unsplash.com) without repeating the
// Unsplash link on every one of a dozen-plus moving tiles.

import type { BentoDestination } from "@/lib/constants";
import { UNSPLASH_ATTRIBUTION_URL } from "@/lib/constants";

function splitColumns(photos: BentoDestination[]): [BentoDestination[], BentoDestination[]] {
  const left: BentoDestination[] = [];
  const right: BentoDestination[] = [];
  photos.forEach((photo, i) => (i % 2 === 0 ? left : right).push(photo));
  return [left, right];
}

function WallColumn({ photos, direction }: { photos: BentoDestination[]; direction: "down" | "up" }) {
  // Duplicated once (not more) — the CSS loop is exactly a 50%-of-total-height cycle,
  // so two copies is the minimum and the correct amount for a seamless loop.
  const doubled = [...photos, ...photos];
  const animationClass = direction === "down" ? "home-wall-col-down" : "home-wall-col-up";

  return (
    <div className="relative h-full flex-1 overflow-hidden">
      <div className={`flex flex-col gap-2.5 ${animationClass}`}>
        {doubled.map((photo, i) => (
          <div
            key={`${photo.id}-${i}`}
            className="relative h-[150px] w-full flex-shrink-0 overflow-hidden rounded-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.imageUrl} alt={photo.name} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0" />
            <a
              href={photo.photographerProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-1.5 top-1.5 font-sans text-[7px] leading-none text-white/55 hover:text-white/85"
            >
              {photo.photographerName}
            </a>
            <div className="absolute bottom-2 left-2.5 font-sans text-[11px] font-semibold text-white">
              {photo.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DestinationWall({ photos }: { photos: BentoDestination[] }) {
  const [left, right] = splitColumns(photos);

  return (
    <div className="mb-5">
      <div className="relative h-[340px] overflow-hidden rounded-[20px]">
        <div className="flex h-full gap-2.5">
          <WallColumn photos={left} direction="down" />
          <WallColumn photos={right} direction="up" />
        </div>
        {/* Soft fade at the top/bottom edges so tiles don't hard-cut against the container
            bound — sits on Home's white background, so a white-to-transparent gradient is
            the correct fade color here (not a generic black vignette). */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>
      <a
        href={UNSPLASH_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block text-center font-sans text-[10px] text-tripoly-text-muted/70 hover:text-tripoly-text-muted"
      >
        Photos via Unsplash
      </a>
    </div>
  );
}
