// Claude API integration. See TRIPOLY_HANDOFF.md section 9.
//
// Scope note: this route is the backend contract only (call Claude, parse/
// validate its response). Triggering it from the Processing screen and
// handling the result (redirect to /itinerary, or bounce back to /chat on
// destination_not_found) is Step 8's job per the build order — not wired here.
import { NextRequest, NextResponse } from "next/server";
import { amendItinerary, generateItinerary, type ClaudeItineraryResult, type TripFields } from "@/lib/claude";
import { enrichItineraryWithPhotos } from "@/lib/unsplash";
import type { Itinerary, Language } from "@/store/useTripStore";

// Adds destination/day photos to a valid result before it goes to the client. Its own
// try/catch is redundant with enrichItineraryWithPhotos's internal per-location handling
// (that function is designed to never throw), but kept here anyway as a second layer —
// a photo-service problem must never turn into a failed itinerary generation, and this
// guarantees that even if a future change to that function's error handling slips.
async function withPhotos(result: ClaudeItineraryResult): Promise<ClaudeItineraryResult> {
  if (!result.valid) return result;
  try {
    const enriched = await enrichItineraryWithPhotos(result);
    return { valid: true, ...enriched };
  } catch (err) {
    console.error("[api/generate-itinerary] photo enrichment failed, continuing without photos:", err);
    return result;
  }
}

const MIN_AMENDMENT_LENGTH = 10; // handoff section 8: "Amendment field ... Min 10 chars."

interface RequestBody {
  mode?: "generate" | "amend";
  name?: unknown;
  destination?: unknown;
  duration?: unknown;
  travelDate?: unknown;
  totalBudget?: unknown;
  perPersonBudget?: unknown;
  travelerCount?: unknown;
  groupType?: unknown;
  travelTheme?: unknown;
  language?: unknown;
  amendmentRequest?: unknown;
  currentItinerary?: unknown;
}

function parseTripFields(body: RequestBody): TripFields | null {
  const {
    name,
    destination,
    duration,
    travelDate,
    totalBudget,
    perPersonBudget,
    travelerCount,
    groupType,
    travelTheme,
    language,
  } = body;

  if (
    typeof name !== "string" ||
    typeof destination !== "string" ||
    typeof duration !== "number" ||
    typeof travelDate !== "string" ||
    typeof totalBudget !== "number" ||
    typeof perPersonBudget !== "number" ||
    typeof travelerCount !== "number" ||
    typeof groupType !== "string" ||
    typeof travelTheme !== "string" ||
    !name ||
    !destination ||
    !travelDate ||
    !groupType ||
    !travelTheme
  ) {
    return null;
  }

  const lang: Language = language === "HI" ? "HI" : "EN";

  return {
    name,
    destination,
    duration,
    travelDate,
    totalBudget,
    perPersonBudget,
    travelerCount,
    groupType,
    travelTheme,
    language: lang,
  };
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const fields = parseTripFields(body);
  if (!fields) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const mode = body.mode === "amend" ? "amend" : "generate";

  try {
    if (mode === "amend") {
      const amendmentRequest = typeof body.amendmentRequest === "string" ? body.amendmentRequest.trim() : "";
      if (amendmentRequest.length < MIN_AMENDMENT_LENGTH) {
        return NextResponse.json({ error: "amendment_too_short" }, { status: 400 });
      }
      if (!body.currentItinerary || typeof body.currentItinerary !== "object") {
        return NextResponse.json({ error: "missing_current_itinerary" }, { status: 400 });
      }

      const result = await amendItinerary(fields, body.currentItinerary as Itinerary, amendmentRequest);
      return NextResponse.json(await withPhotos(result));
    }

    const result = await generateItinerary(fields);
    return NextResponse.json(await withPhotos(result));
  } catch (err) {
    console.error("[api/generate-itinerary]", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }
}
