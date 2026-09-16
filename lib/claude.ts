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

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 8000;
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
    "dates_suggested": ""
  },
  "days": [
    {
      "day": 1,
      "title": "Day 1 — Arrival & Slow Start",
      "location": "the specific city/area this day is based in — change this across days for a multi-stop trip (rule 13), don't leave it the same for all 7 days by default",
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
  } catch {
    throw new Error(`Claude response was not valid JSON: ${jsonText.slice(0, 500)}`);
  }

  return parsed as ClaudeItineraryResult;
}

/** Generates a fresh itinerary from the collected trip fields. */
export function generateItinerary(fields: TripFields): Promise<ClaudeItineraryResult> {
  return callClaude(buildUserPrompt(fields));
}

/** Applies a natural-language amendment to an existing itinerary. */
export function amendItinerary(
  fields: TripFields,
  currentItinerary: Itinerary,
  amendmentRequest: string,
): Promise<ClaudeItineraryResult> {
  return callClaude(buildAmendmentPrompt(fields, currentItinerary, amendmentRequest));
}
