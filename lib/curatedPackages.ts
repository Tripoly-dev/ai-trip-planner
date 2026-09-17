// Tripoly's real curated itinerary packages, extracted from the destination brochure
// PDFs behind FIT Products 1.xlsx (Zoho WorkDrive). Your call: use these as ground truth
// wherever they cover the requested destination/duration, and only ask Claude to
// AI-generate the extra days needed on top — never invent content Tripoly already has.
//
// Source data: lib/data/curatedPackages.json, produced by
// scripts/curated-packages/extract.py (offline pypdf + regex extraction with a
// validation gate — day sequence must be exactly 1..durationDays, cost tiers must be
// present, no suspiciously-short day descriptions). Anything that fails that gate is
// simply absent from this file, so it falls back to full AI generation automatically —
// same as any destination with no brochure at all. Pilot scope (confirmed with you):
// Thailand, Bali, Dubai only, 19 of 23 packages in those three brochures passed the gate
// (83% — above your 75% bar). The 4 excluded ones are either genuine source-content
// defects (Thailand "Beauty Of Thailand" is missing its Bangkok days; Dubai "Highlights
// of Dubai" mislabels a day) or one-off structural variants we deliberately chose not to
// special-case (Bali "Balinese Escape" prices by group size, not hotel tier; Bali "Bali
// Paradise" has one day with no stated meal plan) — not worth the added parsing
// complexity for a single package each.

import curatedPackagesData from "./data/curatedPackages.json";

export interface CuratedDay {
  day: number;
  title: string;
  meals: string;
  description: string;
  optionalActivities: string | null;
}

export type HotelTier = "STANDARD" | "DELUXE" | "LUXURY";

export interface CuratedPackage {
  id: string;
  destination: string;
  name: string;
  durationNights: number;
  durationDays: number;
  cities: { city: string; nights: number }[];
  days: CuratedDay[];
  hotelCities: string[];
  costByTier: Partial<Record<HotelTier, { adult: number; child: number }>>;
  inclusions: string[];
  exclusions: string[];
  sourceFile: string;
}

export const CURATED_PACKAGES: CuratedPackage[] = curatedPackagesData as CuratedPackage[];

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Finds the best real Tripoly package for a destination + requested night count.
 *
 * Matching rule (confirmed with you): case-insensitive, tolerant of the traveler's
 * destination text being a substring of (or a superset of) the package's own destination
 * label — e.g. "Bali" matches a package labelled "Bali", and "Bali, Indonesia" would too.
 *
 * Duration rule (confirmed with you, from the Thailand 10-night example): pick the
 * package with the LARGEST durationNights that is still <= the requested nights — never
 * a longer package trimmed down, since that would mean cutting real Tripoly content.
 * Returns null when no package for that destination fits within the requested duration
 * (including when the destination has no packages at all) — the caller falls back to
 * today's full-AI generation, completely unchanged.
 */
export function findBestCuratedPackage(destination: string, requestedNights: number): CuratedPackage | null {
  const target = normalize(destination);
  if (!target) return null;

  const candidates = CURATED_PACKAGES.filter((pkg) => {
    const pkgDest = normalize(pkg.destination);
    return (pkgDest === target || pkgDest.includes(target) || target.includes(pkgDest)) && pkg.durationNights <= requestedNights;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((best, pkg) => (pkg.durationNights > best.durationNights ? pkg : best));
}

/**
 * Picks the hotel tier whose real Tripoly per-person Adult cost best fits the trip's
 * per-person budget: the highest tier still <= budget. Falls back to the cheapest tier
 * the package actually has data for for a budget below even Standard, rather than
 * failing — the generated itinerary will just run over the requested budget for that one
 * package, same as full-AI generation already can.
 */
export function pickHotelTier(pkg: CuratedPackage, perPersonBudget: number): HotelTier {
  const byPriceDesc: HotelTier[] = ["LUXURY", "DELUXE", "STANDARD"];
  for (const tier of byPriceDesc) {
    const cost = pkg.costByTier[tier];
    if (cost && cost.adult <= perPersonBudget) return tier;
  }
  const cheapestAvailable = [...byPriceDesc].reverse().find((tier) => pkg.costByTier[tier]);
  return cheapestAvailable ?? "STANDARD";
}
