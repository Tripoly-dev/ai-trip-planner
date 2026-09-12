"use client";

import type { Language } from "@/store/useTripStore";

// EN | HI pill toggle. Two visual variants seen across the mockup:
// "outline" — chat header, on a white background (green border/text)
// "overlay" — welcome screen, sitting on top of a dark photo (white border/text)

export interface LanguageToggleProps {
  value: Language;
  onChange: (language: Language) => void;
  variant?: "outline" | "overlay";
}

export function LanguageToggle({ value, onChange, variant = "outline" }: LanguageToggleProps) {
  const isOverlay = variant === "overlay";

  return (
    <div
      className={[
        "inline-flex overflow-hidden rounded-2xl border",
        isOverlay ? "border-white/60" : "border-tripoly-green",
      ].join(" ")}
      role="group"
      aria-label="Language"
    >
      {(["EN", "HI"] as const).map((lang) => {
        const active = value === lang;

        return (
          <button
            key={lang}
            type="button"
            onClick={() => onChange(lang)}
            aria-pressed={active}
            className={[
              "font-sans font-semibold transition-colors",
              isOverlay ? "px-4 py-1.5 text-[13px]" : "px-3 py-1 text-[11px]",
              active
                ? "bg-tripoly-green text-white"
                : isOverlay
                  ? "text-white font-medium"
                  : "text-tripoly-green font-medium",
            ].join(" ")}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
}
