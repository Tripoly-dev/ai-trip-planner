"use client";

// Screen 02A/02B — "Where to next?" destination inspiration carousel card.
// Per TRIPOLY_HANDOFF.md section 7: width 155px, height 200px, rounded-2xl,
// full-bleed photo + dark gradient overlay.
//
// Falls back to a neutral gradient placeholder when no imageUrl is given, so the
// component still renders correctly without one (e.g. for a future dynamic
// destination this app hasn't fetched a photo for yet).
//
// Attribution corner tag: required by Unsplash's API guideline whenever a photo it
// supplied is displayed — credit the photographer, link to their Unsplash profile
// AND to unsplash.com itself (help.unsplash.com/en/articles/2511315-guideline-attribution).
// Kept small/low-opacity so it doesn't compete with the name/tagline, but it's real
// text and real links, not decoration.

import { UNSPLASH_ATTRIBUTION_URL, type UnsplashCredit } from "@/lib/constants";

export interface DestinationCardProps {
  name: string;
  tagline: string;
  imageUrl?: string;
  credit?: Pick<UnsplashCredit, "photographerName" | "photographerProfileUrl">;
  onClick?: () => void;
}

// lg:w-full lg:flex-shrink — on desktop these sit in a CSS grid (HomeScreen), which sizes
// the column; the fixed mobile pixel width and flex-shrink-0 only apply below lg.
const cardClass =
  "relative h-[200px] w-[155px] flex-shrink-0 overflow-hidden rounded-2xl text-left lg:w-full lg:flex-shrink";

function CardContent({
  name,
  tagline,
  imageUrl,
  credit,
}: Pick<DestinationCardProps, "name" | "tagline" | "imageUrl" | "credit">) {
  return (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 from-40% to-black/[0.78]" />
      {imageUrl && credit && (
        <div className="absolute right-2 top-2 font-sans text-[8px] leading-none text-white/60">
          <a
            href={credit.photographerProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-white/90"
          >
            {credit.photographerName}
          </a>
          {" / "}
          <a
            href={UNSPLASH_ATTRIBUTION_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-white/90"
          >
            Unsplash
          </a>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="font-sans text-[13px] font-bold text-white">{name}</div>
        <div className="mt-[3px] font-sans text-[11px] leading-snug text-white/88">{tagline}</div>
      </div>
    </>
  );
}

export function DestinationCard({ name, tagline, imageUrl, credit, onClick }: DestinationCardProps) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClass}>
        <CardContent name={name} tagline={tagline} imageUrl={imageUrl} credit={credit} />
      </button>
    );
  }

  return (
    <div className={cardClass}>
      <CardContent name={name} tagline={tagline} imageUrl={imageUrl} credit={credit} />
    </div>
  );
}
