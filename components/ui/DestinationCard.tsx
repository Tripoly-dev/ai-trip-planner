"use client";

// Screen 02A/02B — "Where to next?" destination inspiration carousel card.
// Per TRIPOLY_HANDOFF.md section 7: width 155px, height 200px, rounded-2xl,
// full-bleed photo + dark gradient overlay.
//
// No image source is wired yet (real photography is a later/content step) — falls back
// to a neutral gradient placeholder so the component still renders correctly without one.

export interface DestinationCardProps {
  name: string;
  tagline: string;
  imageUrl?: string;
  onClick?: () => void;
}

// lg:w-full lg:flex-shrink — on desktop these sit in a CSS grid (HomeScreen), which sizes
// the column; the fixed mobile pixel width and flex-shrink-0 only apply below lg.
const cardClass =
  "relative h-[200px] w-[155px] flex-shrink-0 overflow-hidden rounded-2xl text-left lg:w-full lg:flex-shrink";

function CardContent({ name, tagline, imageUrl }: Pick<DestinationCardProps, "name" | "tagline" | "imageUrl">) {
  return (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 from-40% to-black/[0.78]" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="font-sans text-[13px] font-bold text-white">{name}</div>
        <div className="mt-[3px] font-sans text-[11px] leading-snug text-white/88">{tagline}</div>
      </div>
    </>
  );
}

export function DestinationCard({ name, tagline, imageUrl, onClick }: DestinationCardProps) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClass}>
        <CardContent name={name} tagline={tagline} imageUrl={imageUrl} />
      </button>
    );
  }

  return (
    <div className={cardClass}>
      <CardContent name={name} tagline={tagline} imageUrl={imageUrl} />
    </div>
  );
}
