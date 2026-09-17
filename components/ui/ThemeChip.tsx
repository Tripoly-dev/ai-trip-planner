"use client";

import type { TravelTheme } from "@/store/useTripStore";

// Screen 3, Step 6 (Vibe) — one of the 5 travel theme chips.
// Per TRIPOLY_HANDOFF.md section 14.

export interface ThemeChipProps {
  theme: TravelTheme;
  emoji: string;
  selected?: boolean;
  onClick?: (theme: TravelTheme) => void;
}

export function ThemeChip({ theme, emoji, selected = false, onClick }: ThemeChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(theme)}
      aria-pressed={selected}
      className={[
        "flex h-11 items-center gap-1.5 rounded-2xl px-4 font-sans text-[13px] font-semibold transition active:scale-[0.97]",
        selected
          ? "bg-tripoly-green text-white"
          : "border-[1.5px] border-tripoly-green bg-tripoly-muted text-tripoly-accent",
      ].join(" ")}
    >
      <span aria-hidden="true">{emoji}</span>
      {theme}
    </button>
  );
}
