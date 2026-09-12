"use client";

// Screen 3 — Voice + Text Chat. Per TRIPOLY_HANDOFF.md section 7 (layout), section 8
// (validation rules) and section 10 (Sarvam AI integration).
//
// Step 5 built the UI + conversation state machine (typed input only, Budget-only
// confirm-back). Step 6 adds real voice: press-and-hold mic recording via
// MediaRecorder, Sarvam STT/TTS through /api/stt and /api/tts, and generalizes
// confirm-back to every field for voice-sourced answers (section 8: "Voice
// confirm-back rule — ALL fields"). Typed input keeps Step 5's behavior
// (immediate commit; Budget still always confirms, typed or voice, per spec).
//
// Interpretation calls made with your sign-off:
//  - Travelers + Group Type (one progress-bar segment) are collected as two sequential
//    bot turns rather than parsed from one freeform message.
//  - The mockup's conversation-starter chips ("Plan a Bali trip", ...) are omitted.
//  - TTS auto-plays only for bot replies that follow a voice-sourced user turn —
//    typing stays silent/text-only (confirmed with you for this step).
//  - Hindi voice answers always get confirm-back too (handoff section 16 known
//    issue) — no special-casing needed since ALL voice answers already confirm.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeChip } from "@/components/ui/ThemeChip";
import { TripolyMark } from "@/components/ui/TripolyMark";
import { TripSummaryCard } from "@/components/ui/TripSummaryCard";
import { TRAVEL_THEMES } from "@/lib/constants";
import {
  formatINR,
  isLikelyOffTopic,
  matchGroupType,
  OFF_TOPIC_MESSAGE,
  parseBudget,
  validateDestination,
  validateDuration,
  validateName,
  validateTravelerCount,
} from "@/lib/validators";
import { useTripStore, type Message, type TravelTheme } from "@/store/useTripStore";

type TravelerSubStep = "count" | "group";
type InputSource = "typed" | "voice";

interface PendingConfirm {
  /** Bot line spoken/shown if the user rejects the parsed value. */
  reAskText: string;
  /** Commits the value and advances the conversation. */
  onConfirm: () => void;
}

const DURATION_QUICK_OPTIONS = [5, 7, 10];
const BUDGET_QUICK_OPTIONS = [
  { label: "₹50k", value: "50000" },
  { label: "₹1 lakh", value: "100000" },
  { label: "₹2 lakhs", value: "200000" },
];
const GROUP_TYPE_OPTIONS = ["Family", "Couple", "Friends", "Solo"] as const;
const MIN_RECORDING_BYTES = 2000; // near-empty clips are treated as silence

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

// Whether MediaRecorder + getUserMedia are available — read via useSyncExternalStore
// rather than useState+useEffect: it's an external (browser) capability that never
// changes mid-session, so there's nothing to subscribe to, but the value legitimately
// differs between the server snapshot (no window/navigator) and the client snapshot.
// useSyncExternalStore is the primitive React provides for exactly this — it renders
// the SSR-safe server snapshot on first paint, then reconciles to the real client
// value right after hydration, with no "setState in an effect" and no hydration
// mismatch warning.
function micSupportSnapshot() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}
function micSupportServerSnapshot() {
  return false;
}
function subscribeNoop() {
  return () => {};
}

function QuickChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl bg-tripoly-muted px-3 py-1.5 font-sans text-xs font-semibold text-tripoly-accent"
    >
      {label}
    </button>
  );
}

export function ChatScreen() {
  const router = useRouter();

  const messages = useTripStore((s) => s.messages);
  const addMessage = useTripStore((s) => s.addMessage);
  const setField = useTripStore((s) => s.setField);
  const currentStep = useTripStore((s) => s.currentStep);
  const setStep = useTripStore((s) => s.setStep);
  const language = useTripStore((s) => s.language);
  const destination = useTripStore((s) => s.destination);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const travelTheme = useTripStore((s) => s.travelTheme);
  const isListening = useTripStore((s) => s.isListening);
  const isProcessing = useTripStore((s) => s.isProcessing);

  const [inputValue, setInputValue] = useState("");
  const [travelerSubStep, setTravelerSubStep] = useState<TravelerSubStep>("count");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const micSupported = useSyncExternalStore(subscribeNoop, micSupportSnapshot, micSupportServerSnapshot);

  const scrollRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const lastInputSource = useRef<InputSource>("typed");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  function pushMessage(role: Message["role"], content: string) {
    addMessage({ id: newId(), role, content, timestamp: new Date() });
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
        audioRef.current?.pause();
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audioRef.current = audio;
        // Autoplay can be blocked outside a direct user gesture in some browsers —
        // the text bubble is already visible either way, so this fails silently.
        audio.play().catch(() => {});
      })
      .catch(() => {
        // TTS is a voice-mode enhancement, not a hard requirement — fail silently
        // and let the text bubble carry the message (also covers a missing/invalid
        // SARVAM_API_KEY, e.g. before a real key is configured).
      });
  }

  // Pushes a bot/error/offtopic message, and speaks it only when the user's own last turn
  // was voice — typing stays silent (confirmed with you for Step 6).
  function respond(role: "bot" | "error" | "offtopic", content: string) {
    pushMessage(role, content);
    if (lastInputSource.current === "voice") {
      speak(content);
    }
  }

  // Seed the conversation once.
  useEffect(() => {
    if (seeded.current || messages.length > 0) return;
    seeded.current = true;
    pushMessage("bot", "Hi! I'm Tripoly AI ✈️ What's your name?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Release the mic and stop any playing TTS audio if the user navigates away
  // mid-recording/mid-playback.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  function commitTheme(theme: TravelTheme) {
    setField("travelTheme", theme);
    respond("bot", `Perfect! Generating your ${destination || "trip"} itinerary now... ✨`);
    setTimeout(() => router.push("/processing"), 900);
  }

  function handleThemeChipClick(theme: TravelTheme) {
    const meta = TRAVEL_THEMES.find((t) => t.theme === theme);
    lastInputSource.current = "typed"; // a tap is never voice-sourced
    pushMessage("user", `${meta?.emoji ?? ""} ${theme}`.trim());
    commitTheme(theme);
  }

  function handleSubmit(raw: string, source: InputSource = "typed") {
    const text = raw.trim();
    if (!text || travelTheme) return;

    lastInputSource.current = source;
    pushMessage("user", text);
    setInputValue("");

    if (pendingConfirm) {
      if (/^(y|yes|yeah|yep|correct|right)\b/i.test(text)) {
        const confirm = pendingConfirm;
        setPendingConfirm(null);
        confirm.onConfirm();
      } else if (/^(n|no|nope|wrong)\b/i.test(text)) {
        const confirm = pendingConfirm;
        setPendingConfirm(null);
        respond("bot", confirm.reAskText);
      } else {
        respond("error", "Please answer yes or no.");
      }
      return;
    }

    // Off-topic gate — only the two genuinely open-ended fields need it (see lib/validators.ts
    // comment for why duration/budget/travelers/groupType/theme don't).
    if ((currentStep === 1 || currentStep === 2) && isLikelyOffTopic(text)) {
      respond("offtopic", OFF_TOPIC_MESSAGE);
      return;
    }

    switch (currentStep) {
      case 1: {
        const r = validateName(text);
        if (!r.valid) return respond("error", r.error!);
        const commit = () => {
          setField("name", r.value!);
          respond("bot", `Great ${r.value}! Where would you like to travel?`);
          setStep(2);
        };
        if (source === "voice") {
          setPendingConfirm({ reAskText: "No worries — what's your name?", onConfirm: commit });
          respond("bot", `I heard "${r.value}". Is that correct?`);
        } else {
          commit();
        }
        return;
      }
      case 2: {
        const r = validateDestination(text);
        if (!r.valid) return respond("error", r.error!);
        const commit = () => {
          setField("destination", r.value!);
          respond("bot", "How many days are you planning? (max 10 days)");
          setStep(3);
        };
        if (source === "voice") {
          setPendingConfirm({
            reAskText: "No worries — where would you like to travel?",
            onConfirm: commit,
          });
          respond("bot", `I heard "${r.value}". Is that correct?`);
        } else {
          commit();
        }
        return;
      }
      case 3: {
        const r = validateDuration(text);
        if (!r.valid) return respond("error", r.error!);
        const commit = () => {
          setField("duration", r.value!);
          respond("bot", "What is your total trip budget?");
          setStep(4);
        };
        if (source === "voice") {
          setPendingConfirm({
            reAskText: "No worries — how many days are you planning? (max 10 days)",
            onConfirm: commit,
          });
          respond("bot", `I heard ${r.value} days. Is that correct?`);
        } else {
          commit();
        }
        return;
      }
      case 4: {
        const r = parseBudget(text);
        if (!r.valid) return respond("error", r.error!);
        const commit = () => {
          setField("totalBudget", r.value!);
          respond("bot", "Great! How many travelers?");
          setTravelerSubStep("count");
          setStep(5);
        };
        // Budget always confirms — typed or voice — matching the spec's own example.
        setPendingConfirm({
          reAskText: "No worries — what's your total trip budget?",
          onConfirm: commit,
        });
        respond("bot", `I heard ${formatINR(r.value!)} as your total budget. Is that correct?`);
        return;
      }
      case 5: {
        if (travelerSubStep === "count") {
          const r = validateTravelerCount(text);
          if (!r.valid) return respond("error", r.error!);
          const commit = () => {
            setField("travelerCount", r.value!);
            setField("perPersonBudget", Math.round(totalBudget / r.value!));
            respond("bot", "And what's your group type?");
            setTravelerSubStep("group");
          };
          if (source === "voice") {
            setPendingConfirm({
              reAskText: "No worries — how many travelers?",
              onConfirm: commit,
            });
            respond("bot", `I heard ${r.value} traveler${r.value === 1 ? "" : "s"}. Is that correct?`);
          } else {
            commit();
          }
          return;
        }
        const r = matchGroupType(text);
        if (!r.valid) return respond("error", r.error!);
        const commit = () => {
          setField("groupType", r.value!);
          respond("bot", "Almost there! What kind of trip are you looking for?");
          setStep(6);
        };
        if (source === "voice") {
          setPendingConfirm({
            reAskText: "No worries — what's your group type?",
            onConfirm: commit,
          });
          respond("bot", `I heard ${r.value}. Is that correct?`);
        } else {
          commit();
        }
        return;
      }
      case 6: {
        const match = TRAVEL_THEMES.find((t) => t.theme.toLowerCase() === text.toLowerCase());
        if (!match) return respond("error", "Please pick one of the options below.");
        if (source === "voice") {
          setPendingConfirm({
            reAskText: "No worries — what kind of trip are you looking for?",
            onConfirm: () => commitTheme(match.theme),
          });
          respond("bot", `I heard ${match.theme}. Is that correct?`);
        } else {
          commitTheme(match.theme);
        }
        return;
      }
    }
  }

  async function startRecording() {
    if (!micSupported || travelTheme || isListening || isProcessing) return;
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
      lastInputSource.current = "voice";
      respond("error", "Couldn't access your microphone. Please check permissions or type your answer.");
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
      lastInputSource.current = "voice";

      // Known issue (handoff section 16): Sarvam STT returns garbage on silence —
      // skip the round trip for a clip too short to contain real speech.
      if (blob.size < MIN_RECORDING_BYTES) {
        setField("isProcessing", false);
        respond("error", "I didn't catch that — please try again.");
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
          respond(
            "error",
            data.error === "silence"
              ? "I didn't catch that — please try again."
              : "Sorry, I couldn't hear that clearly. Please try again or type your answer.",
          );
          return;
        }

        handleSubmit(data.transcript, "voice");
      } catch {
        setField("isProcessing", false);
        respond("error", "Voice transcription failed. Please try again or type your answer.");
      }
    };

    mr.stop();
  }

  const showDurationChips = currentStep === 3;
  const showBudgetChips = currentStep === 4 && pendingConfirm === null;
  const showGroupChips = currentStep === 5 && travelerSubStep === "group";
  const showThemeChips = currentStep === 6 && !travelTheme;

  const hint = (() => {
    if (isListening) return "🎙️ Listening... release to send";
    if (isProcessing) return "Transcribing...";
    if (pendingConfirm) return "Reply yes or no";
    switch (currentStep) {
      case 1: return "Letters only, min 2 characters";
      case 2: return "Any destination, min 3 characters";
      case 3: return "Numbers only, max 10 days";
      case 4: return "e.g. 2 lakhs, 2L, or ₹2,00,000";
      case 5: return travelerSubStep === "count" ? "Numbers only, 1–50 travelers" : "Family, Couple, Friends, or Solo";
      case 6: return "Tap a vibe below, or type it";
      default: return "";
    }
  })();

  const micTitle = !micSupported
    ? "Voice input isn't supported in this browser — please type your answer"
    : isListening
      ? "Release to send"
      : isProcessing
        ? "Transcribing..."
        : "Hold to speak";

  return (
    <main className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {/* Left column — the existing mobile chat, unchanged, just capped to 480px and given a
          divider at lg: (section 13: "Left: chat (480px)"). */}
      <div className="flex min-h-dvh flex-1 flex-col lg:w-[480px] lg:flex-none lg:border-r lg:border-tripoly-border">
      <div className="flex-shrink-0 border-b border-tripoly-border px-5 pb-3.5 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <TripolyMark variant="dark" size={22} />
          <LanguageToggle value={language} onChange={(l) => setField("language", l)} variant="outline" />
        </div>
        <ProgressBar currentStep={currentStep} />
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-5">
        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role}>
            {m.content}
          </ChatBubble>
        ))}

        {showDurationChips && (
          <div className="flex flex-wrap gap-2 pl-[34px]">
            {DURATION_QUICK_OPTIONS.map((d) => (
              <QuickChip key={d} label={`${d} days`} onClick={() => handleSubmit(String(d))} />
            ))}
          </div>
        )}

        {showBudgetChips && (
          <div className="flex flex-wrap gap-2 pl-[34px]">
            {BUDGET_QUICK_OPTIONS.map((b) => (
              <QuickChip key={b.value} label={b.label} onClick={() => handleSubmit(b.value)} />
            ))}
            <QuickChip label="Custom" onClick={() => document.getElementById("chat-input")?.focus()} />
          </div>
        )}

        {showGroupChips && (
          <div className="flex flex-wrap gap-2 pl-[34px]">
            {GROUP_TYPE_OPTIONS.map((g) => (
              <QuickChip key={g} label={g} onClick={() => handleSubmit(g)} />
            ))}
          </div>
        )}

        {showThemeChips && (
          <div className="flex flex-wrap gap-2.5 pl-[34px]">
            {TRAVEL_THEMES.map(({ theme, emoji }) => (
              <ThemeChip key={theme} theme={theme} emoji={emoji} onClick={handleThemeChipClick} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 pb-5 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="mb-2 pl-1 font-sans text-[11px] text-[#999]">{hint}</div>
        <div className="flex items-center gap-2.5">
          <input
            id="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit(inputValue);
            }}
            disabled={!!travelTheme || isListening || isProcessing}
            placeholder="Type or speak your answer..."
            className="h-[46px] flex-1 rounded-full bg-tripoly-bubble-offtopic px-[18px] font-sans text-sm text-tripoly-text placeholder:text-[#999] disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!micSupported || !!travelTheme || isProcessing}
            title={micTitle}
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
            className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full transition-colors ${
              !micSupported || travelTheme
                ? "cursor-not-allowed bg-tripoly-green opacity-40"
                : isListening
                  ? "cursor-pointer bg-tripoly-error animate-pulse"
                  : isProcessing
                    ? "cursor-wait bg-tripoly-green opacity-60"
                    : "cursor-pointer bg-tripoly-green"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" fill="#fff" />
              <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      </div>

      {/* Right column — desktop only. Section 13: "Right: live trip summary card updating
          as user answers." */}
      <div className="hidden lg:flex lg:flex-1 lg:items-start lg:justify-center lg:bg-[#fafafa] lg:p-10">
        <div className="w-full max-w-[420px] lg:sticky lg:top-10">
          <TripSummaryCard />
        </div>
      </div>
    </main>
  );
}
