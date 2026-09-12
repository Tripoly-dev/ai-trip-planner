"use client";

// Screen 02A/02B — inspiration nudge card in the fun fact carousel.
// Per TRIPOLY_HANDOFF.md section 7: width 295px, min-height 88px, #F0FDF7 bg.

export interface FunFactCardProps {
  text: string;
  ctaLabel?: string;
  onClick?: () => void;
}

// lg:w-full lg:flex-shrink — on desktop these sit in a CSS grid (HomeScreen), which sizes
// the column; the fixed mobile pixel width and flex-shrink-0 only apply below lg.
const cardClass =
  "flex w-[295px] min-h-[88px] flex-shrink-0 items-start gap-3 rounded-2xl bg-tripoly-muted p-3.5 px-4 text-left lg:w-full lg:flex-shrink";

function CardContent({ text, ctaLabel }: { text: string; ctaLabel: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-tripoly-green text-sm"
      >
        ✨
      </span>
      <span className="flex flex-col">
        <span className="mb-1.5 font-sans text-[13.5px] leading-relaxed text-[#1a1a1a]">{text}</span>
        <span className="font-sans text-[13px] font-semibold text-tripoly-accent">{ctaLabel}</span>
      </span>
    </>
  );
}

export function FunFactCard({ text, ctaLabel = "Plan this with Tripoly →", onClick }: FunFactCardProps) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClass}>
        <CardContent text={text} ctaLabel={ctaLabel} />
      </button>
    );
  }

  return (
    <div className={cardClass}>
      <CardContent text={text} ctaLabel={ctaLabel} />
    </div>
  );
}
