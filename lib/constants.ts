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

export interface DestinationInspiration {
  id: string;
  name: string;
  tagline: string;
}

// "Where to next?" carousel — 5 cards.
export const DESTINATION_CAROUSEL: DestinationInspiration[] = [
  { id: "bali", name: "Bali", tagline: "Sept is perfect — culture & beaches" },
  { id: "kyoto", name: "Kyoto", tagline: "Autumn light & quiet temples" },
  { id: "goa", name: "Goa", tagline: "Long weekends still open" },
  { id: "himachal", name: "Himachal", tagline: "Mountains look beautiful this month" },
  { id: "dubai", name: "Dubai", tagline: "Quick family getaway — 4 nights" },
];

export interface BentoDestination {
  id: string;
  name: string;
}

// Screen 02B bento mosaic — 6 tiles, asymmetric two-row layout.
// Row 1 (110px): Bali (160px wide) | Kyoto (85px) | Goa (85px)
// Row 2 (76px): Dubai (110px) | Switzerland (110px) | Himachal (110px)
export const BENTO_ROW_1: BentoDestination[] = [
  { id: "bali", name: "Bali" },
  { id: "kyoto", name: "Kyoto" },
  { id: "goa", name: "Goa" },
];

export const BENTO_ROW_2: BentoDestination[] = [
  { id: "dubai", name: "Dubai" },
  { id: "switzerland", name: "Switzerland" },
  { id: "himachal", name: "Himachal" },
];

export const TRAVEL_THEMES: { theme: TravelTheme; emoji: string; claudeInstruction: string }[] = [
  { theme: "Relaxed", emoji: "🌅", claudeInstruction: "Slow pace, leisure activities, no packed schedule, spa, beach time, long lunches" },
  { theme: "Adventure", emoji: "🌊", claudeInstruction: "Hiking, water sports, outdoor activities, thrilling experiences" },
  { theme: "Romantic", emoji: "💑", claudeInstruction: "Couples, intimate dining, sunset spots, private experiences, candlelight" },
  { theme: "Family", emoji: "👨‍👩‍👧‍👦", claudeInstruction: "Kid-friendly, safe, mixed activities, early dinners, comfortable hotels" },
  { theme: "Foodie", emoji: "🍽️", claudeInstruction: "Local cuisine, food tours, restaurant recommendations, cooking classes, street food" },
];
