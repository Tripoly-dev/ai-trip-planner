// Claude API integration — server-only. Called exclusively from
// app/api/generate-itinerary/route.ts, which is where ANTHROPIC_API_KEY is read;
// never exposed to the client.
//
// TRIPOLY_HANDOFF.md section 9 (system prompt + JSON contract, verbatim below).
// Uses the Anthropic Messages API directly via fetch — same approach as
// lib/sarvam.ts — rather than adding the @anthropic-ai/sdk dependency for a
// single call shape. Model ID verified against Anthropic's current model docs
// (platform.claude.com/docs/en/models/overview) rather than guessed: "claude-sonnet-5"
// is a real, current API identifier, not a placeholder.
//
// Amendment handling (section 9) isn't given its own endpoint in the spec — only
// one Claude integration point (/api/generate-itinerary) is defined. Confirmed
// with you: rather than inventing a separate extraction/classification endpoint,
// an amendment reuses the same system prompt and JSON contract, with a user
// prompt that includes the current itinerary + the natural-language change
// request and asks Claude to return the full updated itinerary in the same
// schema — one call does both "figure out what changed" and "regenerate."

import type { Itinerary, Language } from "@/store/useTripStore";
import { findBestCuratedPackage, pickHotelTier, type CuratedPackage, type HotelTier } from "./curatedPackages";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// Was 8000 — raised after a real Thailand-10-night hybrid generation hit stop_reason:
// "max_tokens" at ~15,266 output characters (confirmed via the diagnostic logging below,
// not guessed): reproducing Tripoly's real, fuller curated-day content runs longer than
// pure-AI generation's terser prose did, so 11-day itineraries need more headroom than
// before this feature. claude-sonnet-5 supports up to 128K output tokens, so this still
// has plenty of room below the model's actual ceiling.
const MAX_TOKENS = 16500;
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You are Tripoly's AI travel planner. Generate a detailed day-by-day travel itinerary.

Rules:
1. Return ONLY valid JSON. No markdown. No preamble. No explanation.
2. Validate destination is a real place. If not real, return error JSON.
3. Itinerary must match the travel theme precisely.
4. Budget must be respected — distribute across days realistically.
5. All content in the user's selected language (EN or HI).
6. Never generate itineraries for non-travel requests.
7. Per-day cost must sum to approximately the total budget.
8. Drive time between locations must be realistic.
9. trip_summary.name must be exactly the traveler's name as given in the "Name" input below — never a trip title, phrase, or embellishment.
10. trip_summary.destination must be exactly the destination as given in the "Destination" input below (correcting only obvious capitalization) — never a phrase or description.
11. Write like a knowledgeable local friend, not a brochure: specific, sensory, a little opinionated. Never use generic filler ("explore the city", "enjoy local culture", "experience the vibrant nightlife").
12. Name real-sounding, destination-appropriate specifics wherever the schema below asks for one — an actual neighborhood, dish, viewpoint, or landmark, not a category label. If you're not confident a specific name is accurate, describe the specific experience concretely instead of inventing a name that could be wrong.
13. If Destination is a country or broad region rather than a single city (e.g. "Thailand", "Japan", "Rajasthan"), do not keep the traveler in one city for the whole trip — plan across its most famous cities/areas, the way a well-traveled local friend would route a first-time visitor. Exceptions: a short trip (3 nights or fewer) where one well-chosen base is more realistic than city-hopping, or a Relaxed theme, which should favor staying put — at most one change of base (e.g. a calm home base plus a single day trip), never a packed multi-city hop. When you do move the traveler between cities/areas, give each stop enough nights to be worth the move (2+ nights per stop as a rule of thumb) and reflect the change in that day's "location" field and in drive_time/estimated_daily_cost.
14. Prioritize what the destination is actually famous for — its best-known landmarks, neighborhoods, dishes, and experiences — over obscure alternatives, while still following rule 12: name them specifically and describe them vividly, never as a generic checklist item.
15. Include approximate "lat"/"lng" (decimal degrees) for trip_summary (the overall destination) and for each day (that day's "location"). City/neighborhood-level accuracy is enough — this powers a map pin, not turn-by-turn navigation — but give your best real estimate; never place-holder/zero values. If a day's location repeats an earlier day's (a multi-night stay), repeat that same location's coordinates.

Return this exact JSON structure:
{
  "valid": true,
  "trip_summary": {
    "name": "",
    "destination": "",
    "duration_nights": 0,
    "total_budget": 0,
    "per_person_budget": 0,
    "traveler_count": 0,
    "group_type": "",
    "theme": "",
    "dates_suggested": "",
    "lat": 0,
    "lng": 0
  },
  "days": [
    {
      "day": 1,
      "title": "Day 1 — Arrival & Slow Start",
      "location": "the specific city/area this day is based in — change this across days for a multi-stop trip (rule 13), don't leave it the same for all 7 days by default",
      "lat": 0,
      "lng": 0,
      "hotel": {
        "name": "",
        "stars": 4,
        "description": "1-2 sentences: what makes THIS hotel worth it (a specific view, location, or feature) — not a generic 'comfortable stay'"
      },
      "meals": {
        "breakfast": "",
        "lunch": "",
        "dinner": ""
      },
      "activities": {
        "morning": "",
        "afternoon": "",
        "evening": ""
      },
      "estimated_daily_cost": 8400,
      "drive_time": "1h 10m",
      "day_description": "2-3 vivid, sensory sentences capturing this specific day — not a generic summary",
      "tip": "One specific, non-obvious local tip for this day (timing, a local custom, what to skip) — not generic travel advice"
    }
  ]
}

If destination is not a real place, return:
{ "valid": false, "error": "destination_not_found" }`;

export interface TripFields {
  name: string;
  destination: string;
  duration: number;
  totalBudget: number;
  perPersonBudget: number;
  travelerCount: number;
  groupType: string;
  travelTheme: string;
  language: Language;
}

export type ClaudeItineraryResult =
  | ({ valid: true } & Itinerary)
  | { valid: false; error: string };

function buildUserPrompt(fields: TripFields): string {
  return `
Name: ${fields.name}
Destination: ${fields.destination}
Duration: ${fields.duration} nights
Total Budget: ₹${fields.totalBudget}
Per Person Budget: ₹${fields.perPersonBudget}
Travelers: ${fields.travelerCount} (${fields.groupType})
Travel Theme: ${fields.travelTheme}
Language: ${fields.language === "HI" ? "Hindi" : "English"}
Generate a complete itinerary.
`.trim();
}

/**
 * Formats a curated package's real days (everything except the final departure day,
 * which buildCuratedExtensionPrompt handles separately so it can renumber it) as plain
 * text for the prompt — not JSON, since the instruction is "reproduce this content,"
 * and prose is what Claude is being asked to (lightly) rewrite into the schema anyway.
 */
function formatCuratedDaysForPrompt(pkg: CuratedPackage): string {
  const contentDays = pkg.days.slice(0, -1);
  return contentDays
    .map((d) => {
      const optional = d.optionalActivities
        ? `\nOptional activities Tripoly offers this day (mention only if relevant, never invent pricing for these): ${d.optionalActivities}`
        : "";
      return `Day ${d.day} — "${d.title}"\nMeals included: ${d.meals}\nWhat actually happens: ${d.description}${optional}`;
    })
    .join("\n\n");
}

/**
 * The hybrid prompt (section 9's system prompt / JSON contract stay unchanged — this is
 * only a different user-turn). Your call, confirmed: when a real Tripoly package
 * (lib/curatedPackages.ts) covers the destination for up to `pkg.durationNights` of the
 * requested `fields.duration` nights, treat its real days as ground truth Claude must
 * reproduce essentially unchanged, filling in only the schema fields the curated data
 * doesn't carry (hotel name/stars/description, per-meal breakdown, drive_time,
 * estimated_daily_cost, lat/lng, tip) — then generate exactly `newDaysCount` brand-new
 * days (computed here, never left for Claude to count) continuing in the same cities,
 * inserted before the package's final departure day, which is preserved and renumbered
 * to stay last. Falls back entirely to buildUserPrompt when there's no matching package
 * — see generateItinerary below.
 */
function buildCuratedExtensionPrompt(
  fields: TripFields,
  pkg: CuratedPackage,
  tier: HotelTier,
  newDaysCount: number,
): string {
  const departureDay = pkg.days[pkg.days.length - 1];
  const finalDayNumber = pkg.durationDays + newDaysCount;
  const tierCost = pkg.costByTier[tier];
  const citiesLine = pkg.cities.map((c) => `${c.city} (${c.nights} nights)`).join(", ");

  const newDaysSection =
    newDaysCount > 0
      ? `
NEW DAYS TO GENERATE: write exactly ${newDaysCount} brand-new day(s), numbered Day ${pkg.durationDays} through Day ${finalDayNumber - 1}, inserted right after the real days above and right before the departure day. Keep the traveler in the same cities the real package already covers (${citiesLine}) for deeper exploration — do not add a new city. These new days must cover DIFFERENT attractions/activities/restaurants than every real day above — never repeat something already named there.
`
      : "";

  return `
${buildUserPrompt(fields)}

IMPORTANT — this is not a fully AI-generated itinerary. Tripoly already sells a real curated package for this trip, "${pkg.name}" (${pkg.durationNights} nights / ${pkg.durationDays} days), cities: ${citiesLine}. Hotel tier for this budget: ${tier}${tierCost ? ` (₹${tierCost.adult} per adult for this package)` : ""}.

REAL DAYS — reproduce these ${pkg.days.length - 1} days essentially unchanged (same activities, same order, same specifics; only lightly smooth the wording to fit the schema fields below). For each of them, invent only the schema fields this source data doesn't include: hotel name/stars/description appropriate for a ${tier} property in that city, a breakfast/lunch/dinner breakdown consistent with "Meals included", a realistic drive_time, estimated_daily_cost, lat/lng, and a specific local tip.

${formatCuratedDaysForPrompt(pkg)}
${newDaysSection}
DEPARTURE DAY — the real package's final day is departure: "${departureDay.title}": ${departureDay.description}. Reproduce it essentially unchanged as the LAST day of the itinerary, renumbered to Day ${finalDayNumber}.

Return the complete ${finalDayNumber}-day itinerary (real days, then any new days, then the renumbered departure day) in the exact JSON structure already specified.
`.trim();
}

function buildAmendmentPrompt(
  fields: TripFields,
  currentItinerary: Itinerary,
  amendmentRequest: string,
): string {
  return `
${buildUserPrompt(fields)}

The traveler already has this itinerary:
${JSON.stringify(currentItinerary)}

They've asked for this change: "${amendmentRequest}"

Apply only the requested change, keep everything else as consistent as possible
with the existing plan, and return the FULL updated itinerary in the exact same
JSON structure (not a diff, not just the changed fields).
`.trim();
}

/** Strips ``` / ```json fences Claude sometimes wraps JSON in (handoff section 16 known issue). */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Validates a lat/lng pair Claude returned (rule 15 above), or drops it. `parsed` above is
 * only cast to ClaudeItineraryResult, never actually checked against that shape at runtime
 * — same as every other field in this response — so these two numbers get the same
 * "trust nothing, degrade gracefully" treatment as lib/unsplash.ts's photo lookups: a bad
 * value (wrong type, out of range, or (0,0) — "null island", almost always a placeholder
 * rather than a real spot) just means no pin for that point, never a broken map or a
 * failed itinerary.
 */
function cleanCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | undefined {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { lat, lng };
}

/**
 * Applies cleanCoordinates to every lat/lng Claude returned, before the result reaches any
 * caller. Explicitly overwrites `lat`/`lng` with the cleaned value (or undefined) rather
 * than spreading cleanCoordinates' result on top — spreading `undefined` into an object is
 * a no-op in JS, which would silently leave an invalid raw value in place instead of
 * actually dropping it.
 */
function sanitizeItineraryCoordinates(result: ClaudeItineraryResult): ClaudeItineraryResult {
  if (!result.valid) return result;
  const summaryCoord = cleanCoordinates(result.trip_summary.lat, result.trip_summary.lng);
  return {
    ...result,
    trip_summary: { ...result.trip_summary, lat: summaryCoord?.lat, lng: summaryCoord?.lng },
    days: result.days.map((day) => {
      const coord = cleanCoordinates(day.lat, day.lng);
      return { ...day, lat: coord?.lat, lng: coord?.lng };
    }),
  };
}

async function callClaude(userPrompt: string): Promise<ClaudeItineraryResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const raw: string = Array.isArray(data.content)
    ? data.content
        .map((block: { type: string; text?: string }) => (block.type === "text" ? block.text ?? "" : ""))
        .join("")
    : "";

  const jsonText = stripMarkdownFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    // Diagnostic-only (no behavior change): the old version of this error only kept the
    // first 500 chars of jsonText, which looks like a truncation point but isn't
    // necessarily one — it's just where that slice happens to end. To actually tell a
    // max_tokens cutoff apart from a malformed-JSON-in-the-middle bug, this now includes
    // Anthropic's own stop_reason (definitive: "max_tokens" means the response really was
    // cut off; "end_turn" means Claude finished normally and the JSON is malformed
    // somewhere), the real SyntaxError message (V8 reports a character position), the
    // full response length, and both the head AND the tail of the text — truncation shows
    // up at the tail (cut off mid-value with no closing braces), a malformed-syntax bug
    // can be anywhere in between.
    const reason = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(
      `Claude response was not valid JSON. stop_reason=${data.stop_reason} length=${jsonText.length} parseError=${reason}\n--- head ---\n${jsonText.slice(0, 500)}\n--- tail ---\n${jsonText.slice(-500)}`,
    );
  }

  return sanitizeItineraryCoordinates(parsed as ClaudeItineraryResult);
}

/**
 * Generates a fresh itinerary from the collected trip fields. Checks for a real Tripoly
 * curated package (lib/curatedPackages.ts) covering this destination first — if one
 * fits within the requested duration, the hybrid prompt reproduces its real days and
 * only AI-generates whatever extra days are needed. Otherwise, falls back to today's
 * full-AI generation, completely unchanged.
 */
export function generateItinerary(fields: TripFields): Promise<ClaudeItineraryResult> {
  const pkg = findBestCuratedPackage(fields.destination, fields.duration);
  if (!pkg) {
    return callClaude(buildUserPrompt(fields));
  }

  const newDaysCount = fields.duration - pkg.durationNights;
  const tier = pickHotelTier(pkg, fields.perPersonBudget);
  return callClaude(buildCuratedExtensionPrompt(fields, pkg, tier, newDaysCount));
}

/** Applies a natural-language amendment to an existing itinerary. */
export function amendItinerary(
  fields: TripFields,
  currentItinerary: Itinerary,
  amendmentRequest: string,
): Promise<ClaudeItineraryResult> {
  return callClaude(buildAmendmentPrompt(fields, currentItinerary, amendmentRequest));
}
