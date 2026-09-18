// Claude API integration. See TRIPOLY_HANDOFF.md section 9.
//
// Scope note: this route is the backend contract only (call Claude, parse/
// validate its response). Triggering it from the Processing screen and
// handling the result (redirect to /itinerary, or bounce back to /chat on
// destination_not_found) is Step 8's job per the build order — not wired here.
import { NextRequest, NextResponse } from "next/server";
import {
  amendItinerary,
  generateItineraryStreaming,
  type ClaudeItineraryResult,
  type StreamProgress,
  type TripFields,
} from "@/lib/claude";
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

  if (mode === "amend") {
    // Unchanged from before streaming was added — amendments are smaller edits, not the
    // request shape (a fully-curated multi-day trip) that produced the 60+ second calls
    // the streaming path below exists to fix, so this keeps its original plain-JSON
    // contract rather than being folded into the new streaming response shape.
    try {
      const amendmentRequest = typeof body.amendmentRequest === "string" ? body.amendmentRequest.trim() : "";
      if (amendmentRequest.length < MIN_AMENDMENT_LENGTH) {
        return NextResponse.json({ error: "amendment_too_short" }, { status: 400 });
      }
      if (!body.currentItinerary || typeof body.currentItinerary !== "object") {
        return NextResponse.json({ error: "missing_current_itinerary" }, { status: 400 });
      }

      const result = await amendItinerary(fields, body.currentItinerary as Itinerary, amendmentRequest);
      return NextResponse.json(await withPhotos(result));
    } catch (err) {
      console.error("[api/generate-itinerary]", err);
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }
  }

  // mode === "generate": streamed as Server-Sent Events instead of one blocking JSON
  // response. Root cause this fixes (confirmed via Vercel's own request logs, not
  // guessed): a fully-curated 8-day Bali trip took 62.5s end to end — the Anthropic call
  // alone was 60.44s of that — and the request still came back 200 (the server finished
  // fine), but the client never received it. A single response sending zero bytes for a
  // full minute is exactly what a mobile network or an in-between proxy drops as idle.
  // Streaming keeps real bytes flowing the entire time (each SSE frame below), which both
  // avoids that drop and gives the client real "day N of M" progress to show, instead of
  // ProcessingScreen.tsx's old fake rotating status text — see lib/claude.ts's
  // generateItineraryStreaming and ProcessingScreen.tsx's stream-reading loop.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const result = await generateItineraryStreaming(fields, (progress: StreamProgress) => {
          send("progress", progress);
        });

        if (!result.valid) {
          // destination_not_found (or any other Claude-reported invalid) — a real,
          // successful response, just not an itinerary. Same shape ProcessingScreen.tsx
          // already handles via data.valid, unchanged.
          send("result", result);
          return;
        }

        send("photos", {});
        const enriched = await withPhotos(result);
        send("result", enriched);
      } catch (err) {
        console.error("[api/generate-itinerary/stream]", err);
        send("error", { error: "generation_failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
