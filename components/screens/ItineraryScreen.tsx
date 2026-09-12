"use client";

// Screen 5A/5B — Itinerary. Per TRIPOLY_HANDOFF.md section 7 (05A clean pin / 05B
// cinematic), section 9 (amendment handling) and section 12 (bottom nav).
//
// Decisions confirmed with you before building:
//  - 05A/05B has no natural condition to auto-pick between them (unlike Home's
//    returning-vs-new-user), so this screen exposes a visible toggle rather than
//    leaving cinematic view reachable only via ?view=cinematic — the toggle both
//    flips the map style instantly and keeps the URL in sync (still shareable).
//  - The amendment input is fully wired now: text and voice both call the real
//    /api/generate-itinerary "amend" mode built in Step 7, replacing the
//    displayed itinerary on success. The mic button reuses ChatScreen's
//    press-and-hold MediaRecorder/Sarvam STT pattern, duplicated here rather
//    than extracted into a shared hook — ChatScreen's mic flow is already
//    verified end-to-end, and refactoring it purely for reuse right now would
//    risk that working code for a stylistic DRY win.
//  - No maps API is in the tech stack (section 2) — the map areas are gradient
//    placeholders (same convention as DestinationCard's photo slots), with the
//    pin/flight-path SVG overlaid on top since those are the real branded
//    elements, not photography.

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BottomNav, DESKTOP_SIDEBAR_WIDTH_CLASS } from "@/components/ui/BottomNav";
import { ItineraryDayCard } from "@/components/ui/ItineraryDayCard";
import { useTripStore, type Itinerary, type ItineraryView } from "@/store/useTripStore";

const MIN_AMENDMENT_LENGTH = 10;

const SUMMARY_PILLS = (summary: Itinerary["trip_summary"]) => [
  summary.name,
  summary.destination,
  `${summary.duration_nights} Nights`,
  `${summary.traveler_count} Travelers`,
  `₹${summary.total_budget.toLocaleString("en-IN")} total`,
  `₹${summary.per_person_budget.toLocaleString("en-IN")} / person`,
];

export function ItineraryScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const name = useTripStore((s) => s.name);
  const destination = useTripStore((s) => s.destination);
  const duration = useTripStore((s) => s.duration);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const perPersonBudget = useTripStore((s) => s.perPersonBudget);
  const travelerCount = useTripStore((s) => s.travelerCount);
  const groupType = useTripStore((s) => s.groupType);
  const travelTheme = useTripStore((s) => s.travelTheme);
  const language = useTripStore((s) => s.language);
  const itinerary = useTripStore((s) => s.itinerary);
  const itineraryView = useTripStore((s) => s.itineraryView);
  const setField = useTripStore((s) => s.setField);
  const setItinerary = useTripStore((s) => s.setItinerary);
  const isListening = useTripStore((s) => s.isListening);
  const isProcessing = useTripStore((s) => s.isProcessing);

  const [amendmentValue, setAmendmentValue] = useState("");
  const [status, setStatus] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const lastInputSource = useRef<"typed" | "voice">("typed");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Sync the ?view= query param -> store on mount / whenever it changes externally
  // (e.g. a shared cinematic-view link).
  useEffect(() => {
    const queryView: ItineraryView = searchParams.get("view") === "cinematic" ? "05B" : "05A";
    if (queryView !== itineraryView) {
      setField("itineraryView", queryView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Guard: nothing to show without a generated itinerary (e.g. a stale bookmark).
  useEffect(() => {
    if (!itinerary) {
      router.replace("/home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary]);

  function toggleView() {
    const next: ItineraryView = itineraryView === "05A" ? "05B" : "05A";
    setField("itineraryView", next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "05B") {
      params.set("view", "cinematic");
    } else {
      params.delete("view");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function speak(text: string) {
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.audioBase64) return;
        new Audio(`data:audio/wav;base64,${data.audioBase64}`).play().catch(() => {});
      })
      .catch(() => {});
  }

  async function submitAmendment(raw: string, source: "typed" | "voice") {
    const text = raw.trim();
    if (!text || isProcessing) return;
    lastInputSource.current = source;

    if (text.length < MIN_AMENDMENT_LENGTH) {
      setStatus({ kind: "error", text: "Tell me a bit more about what you'd like to change." });
      return;
    }
    if (!itinerary) return;

    setAmendmentValue("");
    setField("isProcessing", true);
    setStatus({ kind: "info", text: "Updating your itinerary…" });

    try {
      const res = await fetch("/api/generate-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "amend",
          name,
          destination,
          duration,
          totalBudget,
          perPersonBudget,
          travelerCount,
          groupType,
          travelTheme,
          language,
          currentItinerary: itinerary,
          amendmentRequest: text,
        }),
      });
      const data = await res.json();
      setField("isProcessing", false);

      if (!res.ok || data.valid === false || !data.trip_summary || !data.days) {
        setStatus({ kind: "error", text: "Sorry, I couldn't make that change — please try rephrasing." });
        if (source === "voice") speak("Sorry, I couldn't make that change. Please try rephrasing.");
        return;
      }

      setItinerary({ trip_summary: data.trip_summary, days: data.days });
      setStatus({ kind: "info", text: "Itinerary updated!" });
      if (source === "voice") speak("Your itinerary has been updated.");
    } catch {
      setField("isProcessing", false);
      setStatus({ kind: "error", text: "Sorry, I couldn't make that change — please try again." });
      if (source === "voice") speak("Sorry, something went wrong. Please try again.");
    }
  }

  async function startRecording() {
    if (isListening || isProcessing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setField("isListening", true);
    } catch {
      setStatus({ kind: "error", text: "Couldn't access your microphone. Please type your change instead." });
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;

    setField("isListening", false);
    setField("isProcessing", true);

    mr.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      chunksRef.current = [];

      if (blob.size < 2000) {
        setField("isProcessing", false);
        setStatus({ kind: "error", text: "I didn't catch that — please try again." });
        return;
      }

      try {
        const form = new FormData();
        form.append("audio", blob, "recording.webm");
        form.append("language", language);
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const data = await res.json();
        setField("isProcessing", false);

        if (!res.ok || !data.transcript) {
          setStatus({ kind: "error", text: "Sorry, I couldn't hear that clearly. Please try again or type." });
          return;
        }
        submitAmendment(data.transcript, "voice");
      } catch {
        setField("isProcessing", false);
        setStatus({ kind: "error", text: "Voice transcription failed. Please try again or type." });
      }
    };

    mr.stop();
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!itinerary) {
    return null;
  }

  const cinematic = itineraryView === "05B";

  return (
    <main
      className={`flex h-dvh flex-col overflow-hidden bg-white pb-[76px] lg:flex-row lg:pb-0 ${DESKTOP_SIDEBAR_WIDTH_CLASS}`}
    >
      {/* Left column at lg: — section 13: "Left: map (50%)". Fixed 325px height + flow
          position is the mobile (05A/05B) markup, unchanged below lg. */}
      <div
        className={`relative h-[325px] flex-shrink-0 lg:h-dvh lg:w-1/2 ${cinematic ? "overflow-hidden bg-[#0d1b14]" : "bg-[#e9efe9]"}`}
      >
        {cinematic ? (
          <>
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, rgba(10,20,15,0.5), rgba(5,10,8,0.75))" }}
            />
            <svg width="100%" height="100%" viewBox="0 0 375 325" className="absolute inset-0">
              <path
                className="itinerary-flight-path"
                d="M70,240 Q160,100 300,90"
                fill="none"
                stroke="#16CF76"
                strokeWidth="2.5"
                strokeDasharray="8 8"
              />
              <circle cx="70" cy="240" r="6" fill="#16CF76" />
              <circle cx="300" cy="90" r="6" fill="#16CF76" />
              <text x="80" y="262" fill="#fff" fontFamily="Poppins" fontSize="11" fontWeight="600">
                Your City
              </text>
              <text x="278" y="76" fill="#fff" fontFamily="Poppins" fontSize="11" fontWeight="600">
                {destination}
              </text>
              <g className="itinerary-flight-plane">
                <path d="M0,-7 L6,6 L0,3 L-6,6 Z" fill="#fff" />
              </g>
            </svg>
          </>
        ) : (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-center">
            <div className="relative mx-auto h-9 w-9">
              <div className="itinerary-pin-ring absolute inset-0 rounded-full bg-tripoly-green opacity-50" />
              <svg width="36" height="36" viewBox="0 0 24 24" className="itinerary-pin-icon relative">
                <path
                  d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"
                  fill="#16CF76"
                />
                <circle cx="12" cy="10" r="3" fill="#fff" />
              </svg>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={toggleView}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 font-sans text-xs font-semibold text-tripoly-text shadow-tripoly-card backdrop-blur"
        >
          {cinematic ? "🌙 Cinematic" : "☀️ Clean"} · Switch view
        </button>
      </div>

      {/* Right column at lg: — section 13: "Right: day cards scrollable (50%)". The -mt-4
          overlap + rounded-top-corner is a mobile bottom-sheet effect over the map above it;
          cancelled at lg: where this is a full-height side-by-side column instead. */}
      <div className="relative -mt-4 flex flex-1 flex-col overflow-hidden rounded-t-3xl bg-white px-5 pt-5 lg:mt-0 lg:w-1/2 lg:flex-none lg:rounded-none lg:border-l lg:border-tripoly-border lg:px-8 lg:pt-8">
        <div className="mx-auto mb-3.5 h-1 w-9 flex-shrink-0 rounded-full bg-[#e0e0e0] lg:hidden" />
        <div className="mb-3 flex-shrink-0 font-sans text-[22px] font-bold text-black">Your Itinerary ✈️</div>

        <div className="mb-1.5 flex flex-shrink-0 gap-2 overflow-x-auto pb-3.5">
          {SUMMARY_PILLS(itinerary.trip_summary).map((label, i) => (
            <span
              key={i}
              className="flex-shrink-0 whitespace-nowrap rounded-xl bg-tripoly-muted px-3 py-[7px] font-sans text-xs font-semibold text-tripoly-accent"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto pb-4">
          {itinerary.days.map((day) => (
            <ItineraryDayCard key={day.day} day={day} />
          ))}
        </div>

        <div className="flex-shrink-0 border-t border-tripoly-border bg-white pb-6 pt-3.5">
          {status && (
            <div
              className={`mb-2 px-1 font-sans text-xs ${
                status.kind === "error" ? "text-tripoly-error" : "text-tripoly-accent"
              }`}
            >
              {status.text}
            </div>
          )}
          <div className="mb-2.5 flex h-[50px] items-center gap-2.5 rounded-2xl border-[1.5px] border-tripoly-green bg-tripoly-muted px-4 shadow-[0_4px_20px_rgba(22,207,118,0.12)]">
            <input
              value={amendmentValue}
              onChange={(e) => setAmendmentValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAmendment(amendmentValue, "typed");
              }}
              disabled={isListening || isProcessing}
              placeholder="Change something? Type or speak..."
              className="flex-1 bg-transparent font-sans text-sm font-medium text-[#0c8f4e] placeholder:text-[#0c8f4e]/70 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={isProcessing}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={() => isListening && stopRecording()}
              onTouchStart={(e) => {
                e.preventDefault();
                startRecording();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopRecording();
              }}
              title={isListening ? "Release to send" : "Hold to speak"}
              className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                isListening ? "animate-pulse bg-tripoly-error" : "bg-tripoly-green"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" fill="#fff" />
                <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push("/pdf")}
            className="flex h-[50px] w-full items-center justify-center rounded-2xl bg-tripoly-green font-sans text-[15px] font-semibold text-white"
          >
            Download as PDF
          </button>
        </div>
      </div>

      <BottomNav active="itinerary" />
    </main>
  );
}
