"use client";

// Screen 1 — Welcome. Per TRIPOLY_HANDOFF.md section 7.
// Hero photo is a gradient placeholder for now (per your call on image handling) — swap
// via the `heroImageUrl` value below once real destination photography is available.

import { useState } from "react";
import Link from "next/link";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { TripolyMark } from "@/components/ui/TripolyMark";
import type { Language } from "@/store/useTripStore";

const heroImageUrl: string | undefined = undefined;

export default function WelcomeScreen() {
  const [language, setLanguage] = useState<Language>("EN");

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black">
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/50 via-black/60 to-black" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 from-0% via-black/10 via-40% to-black/75" />

      <div className="absolute inset-x-0 top-6 z-10 flex items-center justify-between px-6">
        <TripolyMark variant="white" size={30} />
        <LanguageToggle value={language} onChange={setLanguage} variant="overlay" />
      </div>

      <div className="absolute inset-x-0 bottom-[150px] z-10 px-6">
        <h1 className="font-sans text-4xl font-bold leading-tight text-white">
          Plan Your Perfect Trip
        </h1>
        <p className="mt-3 font-sans text-base text-white/92">
          Just tell us where you want to go — we&apos;ll handle the rest
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-10 z-10 px-6">
        <Link
          href="/home"
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-tripoly-green font-sans text-base font-semibold text-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-opacity hover:opacity-90"
        >
          Start Planning →
        </Link>
      </div>
    </main>
  );
}
