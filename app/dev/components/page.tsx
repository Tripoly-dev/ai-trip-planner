"use client";

// Internal QA-only preview of Step 2's design system components, rendered together so
// they can be checked against the mockup. Not part of the app's real screens — remove
// or gate behind a dev-only check before Step 12 (final QA + deploy).

import { useState } from "react";
import { BottomNav } from "@/components/ui/BottomNav";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { DestinationCard } from "@/components/ui/DestinationCard";
import { FunFactCard } from "@/components/ui/FunFactCard";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeChip } from "@/components/ui/ThemeChip";
import type { ChatStep, Language, TravelTheme } from "@/store/useTripStore";

const THEMES: { theme: TravelTheme; emoji: string }[] = [
  { theme: "Relaxed", emoji: "🌅" },
  { theme: "Adventure", emoji: "🌊" },
  { theme: "Romantic", emoji: "💑" },
  { theme: "Family", emoji: "👨‍👩‍👧‍👦" },
  { theme: "Foodie", emoji: "🍽️" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-sans text-sm font-semibold text-tripoly-text-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function ComponentsPreviewPage() {
  const [lang, setLang] = useState<Language>("EN");
  const [selectedTheme, setSelectedTheme] = useState<TravelTheme>("Family");
  const [step, setStep] = useState<ChatStep>(3);

  return (
    <main className="mx-auto max-w-3xl p-8 pb-32">
      <h1 className="mb-8 font-sans text-2xl font-bold">Design system preview</h1>

      <Section title="ProgressBar">
        <div className="max-w-sm">
          <ProgressBar currentStep={step} />
        </div>
        <div className="mt-3 flex gap-2">
          {([1, 2, 3, 4, 5, 6] as ChatStep[]).map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className="rounded border border-tripoly-border px-2 py-1 text-xs"
            >
              step {s}
            </button>
          ))}
        </div>
      </Section>

      <Section title="LanguageToggle — outline (chat header)">
        <LanguageToggle value={lang} onChange={setLang} variant="outline" />
      </Section>

      <Section title="LanguageToggle — overlay (on photo)">
        <div className="inline-block rounded-xl bg-black p-4">
          <LanguageToggle value={lang} onChange={setLang} variant="overlay" />
        </div>
      </Section>

      <Section title="ChatBubble — all 4 roles">
        <div className="flex max-w-sm flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          <ChatBubble role="bot">Hi! I&apos;m Tripoly AI ✈️ What&apos;s your name?</ChatBubble>
          <ChatBubble role="user">Kaushik</ChatBubble>
          <ChatBubble role="offtopic">✈️ I&apos;m Tripoly&apos;s Itinerary Planner. I can only help you plan your perfect trip!</ChatBubble>
          <ChatBubble role="error">Please enter a valid name (letters only).</ChatBubble>
        </div>
      </Section>

      <Section title="ThemeChip — 5 travel themes">
        <div className="flex flex-wrap gap-2.5">
          {THEMES.map(({ theme, emoji }) => (
            <ThemeChip
              key={theme}
              theme={theme}
              emoji={emoji}
              selected={selectedTheme === theme}
              onClick={setSelectedTheme}
            />
          ))}
        </div>
      </Section>

      <Section title="FunFactCard">
        <div className="flex gap-2.5 overflow-x-auto">
          <FunFactCard text="September is perfect for Bali — beaches, temples & culture under ₹2 lakhs" />
          <FunFactCard
            text="Did you know? Kyoto's autumn foliage peaks in November — plan 5 days from ₹85,000"
            onClick={() => alert("clicked")}
          />
        </div>
      </Section>

      <Section title="DestinationCard">
        <div className="flex gap-3">
          <DestinationCard name="Bali" tagline="Sept is perfect — culture & beaches" />
          <DestinationCard name="Kyoto" tagline="Autumn light & quiet temples" onClick={() => alert("clicked")} />
        </div>
      </Section>

      <Section title="BottomNav">
        {/* BottomNav is position:fixed (pinned to the real viewport bottom, as used on the
            actual Home/Itinerary screens) — it renders at the bottom of this whole preview
            page rather than inside this box. */}
        <p className="text-xs text-tripoly-text-muted">Rendered fixed at the bottom of this page ↓</p>
        <BottomNav active="itinerary" />
      </Section>
    </main>
  );
}
