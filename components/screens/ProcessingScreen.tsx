"use client";

// Screen 4 — Processing. Per TRIPOLY_HANDOFF.md section 7 (layout) and section 9
// (the actual API call + response contract). Plane-loop SVG path, trail dash
// animation and dot values are taken verbatim from the mockup — the mockup shows
// three status lines (first bold/green, other two grey) rather than the single
// generic subtext described in section 7's prose; matched the mockup and cycle
// the emphasis between the three lines while the real request is in flight.
//
// Recovery behavior — simplified as part of the pure-conversational rebuild, now that
// ChatScreen has no step machine to rewind (store/useTripStore.ts dropped ChatStep/
// currentStep/setStep entirely):
//  - destination_not_found (the one failure the JSON contract defines): clear only
//    destination and bounce back to /chat with the spec's exact re-ask line.
//    lib/fields.ts's nextMissingField() then correctly re-asks for destination while
//    every other already-collected field (duration, budget, travelers, group, theme)
//    stays put — the old step machine had no partial-resume path, which is why the
//    original version cleared travelTheme and rewound everything from destination
//    onward too; that limitation no longer exists, so nothing else needs clearing.
//  - Any other failure (network error, API outage, malformed response — none of which
//    the spec addresses): nothing about the collected fields was actually wrong, so
//    nothing is cleared. Bounce back to /chat with a generic apology — the recap's
//    "Generate My Trip" button (TripSummaryCard) is immediately available again as a
//    one-click retry, replacing the old "rewind to the theme step so re-tapping a
//    theme chip retries generation" workaround, which only existed because the state
//    machine had no other way to expose a retry affordance.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TripolyMark } from "@/components/ui/TripolyMark";
import { useTripStore, type Itinerary, type Message } from "@/store/useTripStore";

const MIN_DISPLAY_MS = 2600;
const STATUS_LINES = ["Finding the best stays…", "Mapping your route…", "Building your day-by-day plan…"];
const STATUS_INTERVAL_MS = 1800;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function ProcessingScreen() {
  const router = useRouter();

  const name = useTripStore((s) => s.name);
  const destination = useTripStore((s) => s.destination);
  const duration = useTripStore((s) => s.duration);
  const travelDate = useTripStore((s) => s.travelDate);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const perPersonBudget = useTripStore((s) => s.perPersonBudget);
  const travelerCount = useTripStore((s) => s.travelerCount);
  const groupType = useTripStore((s) => s.groupType);
  const travelTheme = useTripStore((s) => s.travelTheme);
  const language = useTripStore((s) => s.language);
  const setField = useTripStore((s) => s.setField);
  const addMessage = useTripStore((s) => s.addMessage);
  const setItinerary = useTripStore((s) => s.setItinerary);

  const [activeLine, setActiveLine] = useState(0);
  // Real progress from the streamed response (see the fetch loop below) — null until the
  // first "progress" SSE frame arrives, so nothing renders before there's a real number to
  // show (no flash of "Day 0 of 0").
  const [progress, setProgress] = useState<{ day: number; totalDays: number } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveLine((i) => (i + 1) % STATUS_LINES.length);
    }, STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Defensive guard: this screen only makes sense at the end of a completed
    // chat flow (e.g. a stale bookmark could land here with nothing to generate).
    if (!destination || !travelTheme) {
      router.replace("/chat");
      return;
    }

    function bounceToChat(content: string) {
      const message: Message = { id: newId(), role: "bot", content, timestamp: new Date() };
      addMessage(message);
      router.push("/chat");
    }

    const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_DISPLAY_MS));

    // Never rejects — every failure mode (HTTP error, network error) is captured
    // as a resolved { ok: false, error } value instead of a thrown error. A
    // rejected promise inside Promise.all short-circuits as soon as it rejects,
    // which would skip the MIN_DISPLAY_MS floor below on any failure; capturing
    // outcomes instead keeps Promise.all waiting for the slower of the two on
    // every path, not just the success path.
    type ApiResultData = { valid: boolean; error?: string } & Partial<Itinerary>;
    type ApiOutcome = { ok: true; data: ApiResultData } | { ok: false; error: string };

    // Reads app/api/generate-itinerary/route.ts's streamed Server-Sent Events instead of
    // one blocking res.json() — fixes a real failure (confirmed via Vercel's request logs):
    // a fully-curated 8-day trip took 60+ seconds server-side with zero bytes sent back
    // until the very end, and the connection was dropped before the response arrived even
    // though the server finished successfully. Reading the stream keeps bytes flowing the
    // whole time, and doubles as the source for the real "day N of M" progress below
    // (setProgress), replacing the old blind wait.
    const apiOutcome: Promise<ApiOutcome> = (async (): Promise<ApiOutcome> => {
      try {
        const res = await fetch("/api/generate-itinerary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        });

        if (!res.ok || !res.body) {
          return { ok: false, error: "network_error" };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = ""; // raw bytes not yet resolved into a complete SSE frame
        let outcome: ApiOutcome | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line — drain every complete one we have.
          let frameEnd: number;
          while ((frameEnd = sseBuffer.indexOf("\n\n")) !== -1) {
            const frame = sseBuffer.slice(0, frameEnd);
            sseBuffer = sseBuffer.slice(frameEnd + 2);

            let eventType = "";
            let dataLine = "";
            for (const line of frame.split("\n")) {
              if (line.startsWith("event:")) eventType = line.slice("event:".length).trim();
              else if (line.startsWith("data:")) dataLine += line.slice("data:".length).trim();
            }
            if (!dataLine) continue;

            let payload: unknown;
            try {
              payload = JSON.parse(dataLine);
            } catch {
              continue; // a malformed frame is skipped, not fatal
            }

            if (eventType === "progress") {
              const p = payload as { day: number; totalDays: number };
              setProgress(p);
            } else if (eventType === "result") {
              outcome = { ok: true, data: payload as ApiResultData };
            } else if (eventType === "error") {
              const e = payload as { error?: string };
              outcome = { ok: false, error: e.error || "generation_failed" };
            }
            // "photos" event carries no data needed here — it only exists so the stream
            // keeps sending bytes during the (brief) photo-enrichment step after
            // generation finishes, same idle-connection reasoning as the rest of this.
          }
        }

        return outcome ?? { ok: false, error: "generation_failed" };
      } catch {
        return { ok: false, error: "network_error" };
      }
    })();

    Promise.all([apiOutcome, minDelay])
      .then(([outcome]) => {
        // A non-2xx response is always a real failure (auth, network, upstream
        // error) — the route only ever returns destination_not_found as a 200
        // (Claude successfully responded, it just said the place isn't real),
        // so that case is handled below via data.valid, not here.
        if (!outcome.ok) {
          throw new Error(outcome.error || "generation_failed");
        }

        const data = outcome.data;
        if (data.valid === false) {
          if (data.error === "destination_not_found") {
            setField("destination", "");
            bounceToChat("I couldn't find that destination, please try again.");
            return;
          }
          throw new Error(data.error || "generation_failed");
        }

        if (!data.trip_summary || !data.days) {
          throw new Error("malformed_response");
        }

        setItinerary({ trip_summary: data.trip_summary, days: data.days });
        router.push("/itinerary");
      })
      .catch(() => {
        bounceToChat("Something went wrong generating your itinerary. Let's try that again!");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white">
      <div className="mt-14">
        <TripolyMark variant="dark" size={26} />
      </div>

      <div className="relative flex w-full flex-1 items-center justify-center">
        <svg width="260" height="220" viewBox="0 0 260 220" style={{ overflow: "visible" }}>
          <path
            className="processing-plane-trail"
            d="M40,170 C40,90 100,40 130,40 C180,40 220,90 220,140 C220,180 180,190 150,170 C120,150 130,110 170,100"
            fill="none"
            stroke="#16CF76"
            strokeWidth="2.5"
            strokeDasharray="6 8"
            opacity="0.55"
          />
          <g className="processing-plane-icon">
            <path d="M0,-9 L7,7 L0,4 L-7,7 Z" fill="#16CF76" />
          </g>
        </svg>
      </div>

      <div className="px-10 pb-2 text-center">
        <div className="font-sans text-xl font-semibold text-black">
          Crafting your perfect {destination || "trip"} trip...
        </div>
        <div className="mt-4 flex flex-col items-center gap-2">
          {STATUS_LINES.map((line, i) => (
            <div
              key={line}
              className={
                i === activeLine
                  ? "font-sans text-sm font-semibold text-tripoly-accent"
                  : "font-sans text-[13px] text-[#bbbbbb]"
              }
            >
              {line}
            </div>
          ))}
        </div>

        {/* Real progress from the streamed response — see the fetch loop above. Hidden
            until the first "progress" event arrives (no fake starting point), and the
            fill is clamped to 100% even if the actual day count runs past the estimate
            used for a pure-AI (non-curated) trip. */}
        {progress && (
          <div className="mx-auto mt-5 w-full max-w-[220px]">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eeeeee]">
              <div
                className="h-full rounded-full bg-tripoly-green transition-[width] duration-500 ease-out"
                style={{ width: `${Math.min(100, Math.round((progress.day / progress.totalDays) * 100))}%` }}
              />
            </div>
            <div className="mt-2 font-sans text-xs text-tripoly-text-muted">
              Day {Math.min(progress.day, progress.totalDays)} of {progress.totalDays}
            </div>
          </div>
        )}
      </div>

      <div className="mb-[60px] mt-7 flex gap-2">
        <div className="processing-dot h-[9px] w-[9px] rounded-full bg-tripoly-green" style={{ animationDelay: "0s" }} />
        <div className="processing-dot h-[9px] w-[9px] rounded-full bg-tripoly-green" style={{ animationDelay: "0.2s" }} />
        <div className="processing-dot h-[9px] w-[9px] rounded-full bg-tripoly-green" style={{ animationDelay: "0.4s" }} />
      </div>
    </main>
  );
}
