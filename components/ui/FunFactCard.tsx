"use client";

// Screen 02A/02B — inspiration nudge card in the fun fact carousel.
// Per TRIPOLY_HANDOFF.md section 7: #F0FDF7 bg. Sized larger than the original 295x88
// spec per your live-portal feedback ("quote section width, height and length") — see
// the carousel in HomeScreen.tsx for the auto-advance behavior added alongside this.

export interface FunFactCardProps {
  text: string;
  ctaLabel?: string;
  onClick?: () => void;
}

// lg:w-full lg:flex-shrink — on desktop these sit in a CSS grid (HomeScreen), which sizes
// the column; the fixed mobile pixel width and flex-shrink-0 only apply below lg.
// Widened/heightened from the original 295x88 spec — see HomeScreen.tsx's carousel
// STEP constant, which must stay in sync with this width + its gap.
const cardClass =
  "flex w-[320px] min-h-[108px] flex-shrink-0 items-start gap-3.5 rounded-2xl bg-tripoly-muted p-4 px-5 text-left lg:w-full lg:flex-shrink";

function CardContent({ text, ctaLabel }: { text: string; ctaLabel: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-tripoly-green text-base"
      >
        ✨
      </span>
      <span className="flex flex-col">
        <span className="mb-2 font-sans text-[14.5px] leading-relaxed text-[#1a1a1a]">{text}</span>
        <span className="font-sans text-[13.5px] font-semibold text-tripoly-accent">{ctaLabel}</span>
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
