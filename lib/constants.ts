// Fun facts, destination inspiration, and travel themes.
// Content copied verbatim from TRIPOLY_HANDOFF.md section 7 (Home screen) and
// section 14 (Travel Themes).

import type { TravelTheme } from "@/store/useTripStore";

export interface FunFact {
  id: string;
  text: string;
}

export const FUN_FACTS: FunFact[] = [
  { id: "bali-sept", text: "September is perfect for Bali — beaches, temples & culture under ₹2 lakhs" },
  { id: "kyoto-autumn", text: "Did you know? Kyoto's autumn foliage peaks in November — plan 5 days from ₹85,000" },
  { id: "goa-oct", text: "October long weekends in Goa — flights are still affordable, book before they fill up" },
  { id: "dubai-winter", text: "Dubai in winter is magical — family of 4 can do 4 nights under ₹1.5 lakhs" },
  { id: "himachal-sept", text: "Himachal Pradesh in September — crisp air, snow peaks, no summer crowds" },
  { id: "switzerland", text: "Switzerland is surprisingly doable — 7 nights from ₹3.5 lakhs per person" },
  { id: "sri-lanka", text: "Sri Lanka is 3.5 hours away and wildly underrated — best time is now" },
  { id: "vietnam", text: "Vietnam end-to-end in 8 days — one of the best value trips from India right now" },
  { id: "rajasthan", text: "Rajasthan in October — forts, deserts & culture before the peak season prices kick in" },
  { id: "maldives", text: "Maldives for couples — 4 nights in an overwater villa from ₹1.8 lakhs per person" },
];

// Photo credit for a hardcoded Unsplash image — required by Unsplash's API
// attribution guideline (help.unsplash.com/en/articles/2511315-guideline-attribution):
// every displayed photo must credit the photographer, link to their Unsplash
// profile, and link to Unsplash itself, each with ?utm_source=tripoly&utm_medium=referral.
// These 6 URLs were fetched once via scripts/fetch-home-photos.mjs (international
// destinations only, per your call — no domestic/India destinations here) and hardcoded
// rather than queried live, since this is a fixed, unchanging set — visually verified
// (Tanah Lot for Bali, Kiyomizu-dera for Kyoto, Sheikh Zayed Rd for Dubai, Ha Long Bay for
// Vietnam, an overwater villa for Maldives, an alpine lake for Switzerland) before use.
export interface UnsplashCredit {
  imageUrl: string;
  photographerName: string;
  photographerProfileUrl: string;
}

export const UNSPLASH_ATTRIBUTION_URL = "https://unsplash.com/?utm_source=tripoly&utm_medium=referral";

export interface DestinationInspiration extends UnsplashCredit {
  id: string;
  name: string;
  tagline: string;
}

// "Where to next?" carousel — 5 cards.
export const DESTINATION_CAROUSEL: DestinationInspiration[] = [
  {
    id: "bali",
    name: "Bali",
    tagline: "Sept is perfect — culture & beaches",
    imageUrl:
      "https://images.unsplash.com/photo-1624935851312-845758a99160?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    photographerName: "Eyestetix Studio",
    photographerProfileUrl: "https://unsplash.com/@eyestetix_studio?utm_source=tripoly&utm_medium=referral",
  },
  {
    id: "kyoto",
    name: "Kyoto",
    tagline: "Autumn light & quiet temples",
    imageUrl:
      "https://images.unsplash.com/photo-1578469645742-46cae010e5d4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    photographerName: "Cosmin Georgian",
    photographerProfileUrl: "https://unsplash.com/@cosmingeorgian?utm_source=tripoly&utm_medium=referral",
  },
  {
    id: "vietnam",
    name: "Vietnam",
    tagline: "Ha Long Bay is even better in person",
    imageUrl:
      "https://images.unsplash.com/photo-1643029891412-92f9a81a8c16?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    photographerName: "Marina Lobato",
    photographerProfileUrl: "https://unsplash.com/@mlobatopl?utm_source=tripoly&utm_medium=referral",
  },
  {
    id: "maldives",
    name: "Maldives",
    tagline: "Overwater villas, couple goals",
    imageUrl:
      "https://images.unsplash.com/photo-1697898109604-e06e88b15271?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    photographerName: "Matheen Faiz",
    photographerProfileUrl: "https://unsplash.com/@matheenfaiz?utm_source=tripoly&utm_medium=referral",
  },
  {
    id: "dubai",
    name: "Dubai",
    tagline: "Quick family getaway — 4 nights",
    imageUrl:
      "https://images.unsplash.com/photo-1546412414-8035e1776c9a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    photographerName: "Darcey Beau",
    photographerProfileUrl: "https://unsplash.com/@darceybeau?utm_source=tripoly&utm_medium=referral",
  },
];

export interface BentoDestination extends UnsplashCredit {
  id: string;
  name: string;
}

// Screen 02B bento mosaic — 6 tiles, asymmetric two-row layout.
// Row 1 (110px): Bali (160px wide) | Kyoto (85px) | Vietnam (85px)
// Row 2 (76px): Dubai (110px) | Switzerland (110px) | Maldives (110px)
export const BENTO_ROW_1: BentoDestination[] = [
  DESTINATION_CAROUSEL[0], // Bali
  DESTINATION_CAROUSEL[1], // Kyoto
  DESTINATION_CAROUSEL[2], // Vietnam
];

// Extracted to a named const (rather than left inline in BENTO_ROW_2) so
// WALL_DESTINATIONS below can reuse it too, without a fragile array-index reference.
const SWITZERLAND: BentoDestination = {
  id: "switzerland",
  name: "Switzerland",
  imageUrl:
    "https://images.unsplash.com/photo-1533326150585-8692556a5f04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
  photographerName: "Timon Studler",
  photographerProfileUrl: "https://unsplash.com/@derstudi?utm_source=tripoly&utm_medium=referral",
};

export const BENTO_ROW_2: BentoDestination[] = [
  DESTINATION_CAROUSEL[4], // Dubai
  SWITZERLAND,
  DESTINATION_CAROUSEL[3], // Maldives
];

// Home screen's two-column scrolling image wall (new — not part of the original
// TRIPOLY_HANDOFF.md mockup). Seeded for now with the same 6 photos already used
// elsewhere on Home (DESTINATION_CAROUSEL + Switzerland) — deliberately temporary: a
// larger, dedicated set of ~10 more international destinations was sourced separately
// (scripts/fetch-more-destinations.mjs) so the wall doesn't just repeat the "Where to
// next?" carousel below it. Swap this array once that set lands.
export const WALL_DESTINATIONS: BentoDestination[] = [...DESTINATION_CAROUSEL, SWITZERLAND];

export const TRAVEL_THEMES: { theme: TravelTheme; emoji: string; claudeInstruction: string }[] = [
  { theme: "Relaxed", emoji: "🌅", claudeInstruction: "Slow pace, leisure activities, no packed schedule, spa, beach time, long lunches" },
  { theme: "Adventure", emoji: "🌊", claudeInstruction: "Hiking, water sports, outdoor activities, thrilling experiences" },
  { theme: "Romantic", emoji: "💑", claudeInstruction: "Couples, intimate dining, sunset spots, private experiences, candlelight" },
  { theme: "Family", emoji: "👨‍👩‍👧‍👦", claudeInstruction: "Kid-friendly, safe, mixed activities, early dinners, comfortable hotels" },
  { theme: "Foodie", emoji: "🍽️", claudeInstruction: "Local cuisine, food tours, restaurant recommendations, cooking classes, street food" },
];
