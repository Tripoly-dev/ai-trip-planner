"use client";

// Screen 02A/02B — inspiration nudge card in the fun fact carousel.
// Per TRIPOLY_HANDOFF.md section 7: #F0FDF7 bg.
//
// Width: per your feedback ("I want to see 1 quote at a time and not 2") — sized to
// exactly fill the mobile scroll row's visible width (100vw minus the page's 20px left
// inset — HomeScreen.tsx's content wrapper is px-5, and the scroller bleeds to the true
// right edge via -mr-5, so the scroller's rendered width IS 100vw-20px), so no sliver of
// the next card is ever visible. See HomeScreen.tsx's FunFactCarousel, which measures
// this same rendered width live (not a hardcoded number) to drive auto-advance/dots.
//
// Badge: per your feedback ("Tripoly logo instead of plain star design") — swapped the
// ✨ emoji for the real TripolyMark icon. The icon is green-on-transparent (see
// TripolyMark.tsx), so the badge background changed from tripoly-green to white —
// green-on-green would've had no contrast.

import { TripolyMark } from "@/components/ui/TripolyMark";

export interface FunFactCardProps {
  text: string;
  ctaLabel?: string;
  onClick?: () => void;
}

// lg:w-full lg:flex-shrink — on desktop these sit in a CSS grid (HomeScreen), which sizes
// the column; the mobile width and flex-shrink-0 only apply below lg. snap-start pairs
// with the scroller's snap-x snap-mandatory (HomeScreen.tsx) for crisp one-card swipes;
// harmless on desktop, where the grid doesn't scroll-snap at all.
const cardClass =
  "flex w-[calc(100vw-20px)] min-h-[108px] flex-shrink-0 snap-start items-start gap-3.5 rounded-2xl bg-tripoly-muted p-4 px-5 text-left lg:w-full lg:flex-shrink";

// Design-audit fix: ctaLabel used to render unconditionally, even in the (currently
// only-ever-used) non-interactive <div> variant below — a "Plan this with Tripoly →"
// line that looked like a link but did nothing on tap, since HomeScreen.tsx never
// passes onClick. Root-caused rather than just deleting the text: CardContent now only
// receives/shows ctaLabel when the card is genuinely interactive, so the label
// reappears on its own if a future onClick wiring makes these cards clickable again.
function CardContent({ text, ctaLabel }: { text: string; ctaLabel?: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
      >
        <TripolyMark size={20} />
      </span>
      <span className="flex flex-col">
        <span className={`font-sans text-[14.5px] leading-relaxed text-[#1a1a1a] ${ctaLabel ? "mb-2" : ""}`}>
          {text}
        </span>
        {ctaLabel && <span className="font-sans text-[13.5px] font-semibold text-tripoly-accent">{ctaLabel}</span>}
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
      <CardContent text={text} />
    </div>
  );
}
