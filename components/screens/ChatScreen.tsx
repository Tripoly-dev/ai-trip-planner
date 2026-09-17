"use client";

// Screen 3 — Voice + Text Chat. Per TRIPOLY_HANDOFF.md section 7 (layout) and
// section 10 (Sarvam AI integration).
//
// Full pure-conversational rebuild (confirmed with you, replacing the Option A
// redesign below it superseded): the fixed 1-6 step machine (ChatStep/currentStep/
// setStep in store/useTripStore.ts) is gone. There is no longer a "step" the user must
// answer in order — every free-text message goes to the unified /api/chat-turn
// endpoint (lib/chatTurn.ts) with a snapshot of everything already collected, and
// Claude can extract zero, one, or several of the 7 fields from a single message,
// always returning one natural in-language reply. This is the direct fix for what you
// reported after live-testing Option A: information given early in the conversation
// wasn't visible three turns later because each fallback call only ever knew about ONE
// field in isolation. The known cost/latency tradeoff of calling Claude on every
// free-text turn (not just on local-parse failure) is the one you explicitly accepted
// when choosing this over the smaller, contained fix.
//
// What's unchanged from Option A:
//  - Every bot line is bilingual, picked from lib/chatCopy.ts via the live `language`
//    toggle at the moment each message is generated.
//  - Mic UX: tap-to-toggle, live waveform in the input area, Cancel during recording,
//    a review step after transcription (transcript lands in the editable input box,
//    Send/Clear instead of auto-submit).
//  - TTS only auto-plays for bot replies following a voice-sourced user turn.
//
// What's new in this rebuild:
//  - Quick-chip taps (duration/budget/travelers/group/theme) stay 100% local/free —
//    an exact canonical value never needs Claude to confirm it's valid — but which
//    chips show is now driven by lib/fields.ts's nextMissingField() (the first still-
//    missing field in priority order), not a step number, so out-of-order answers are
//    recognized correctly instead of assuming a fixed sequence.
//  - Trip Generation no longer auto-fires the instant the last field lands (previously
//    always the theme, since theme was hardcoded as the last step). Once
//    nextMissingField() is null, a recap (TripSummaryCard, reused inline here for
//    mobile) appears with an explicit "Generate My Trip" button — the deterministic
//    completion gate is code, never the model's own sense of "I think that's everything."
//  - Voice replies stream via a GET /api/tts (Sarvam's streaming endpoint) played
//    through a native <audio> element instead of waiting for a full base64 clip —
//    closes the ~5s gap before voice used to start speaking.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeChip } from "@/components/ui/ThemeChip";
import { TripolyMark } from "@/components/ui/TripolyMark";
import { TripSummaryCard } from "@/components/ui/TripSummaryCard";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { chatCopy, t, type Bilingual } from "@/lib/chatCopy";
import { TRAVEL_THEMES } from "@/lib/constants";
import { nextMissingField, type FieldKey } from "@/lib/fields";
import {
  matchGroupType,
  parseBudget,
  validateDuration,
  type ValidationResult,
} from "@/lib/validators";
import { useTripStore, type GroupType, type Message, type TravelTheme, type TripStore } from "@/store/useTripStore";

type InputSource = "typed" | "voice";

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
// changes mid-session, but the value legitimately differs between the server snapshot
// (no window/navigator) and the client snapshot. This renders the SSR-safe server
// snapshot on first paint, then reconciles to the real client value right after
// hydration, with no "setState in an effect" and no hydration mismatch warning.
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
  const applyFields = useTripStore((s) => s.applyFields);
  const language = useTripStore((s) => s.language);
  const name = useTripStore((s) => s.name);
  const destination = useTripStore((s) => s.destination);
  const duration = useTripStore((s) => s.duration);
  const travelDate = useTripStore((s) => s.travelDate);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const travelerCount = useTripStore((s) => s.travelerCount);
  const groupType = useTripStore((s) => s.groupType);
  const travelTheme = useTripStore((s) => s.travelTheme);
  const isListening = useTripStore((s) => s.isListening);
  const isProcessing = useTripStore((s) => s.isProcessing);
  const isExtracting = useTripStore((s) => s.isExtracting);

  const [inputValue, setInputValue] = useState("");
  // True once a voice transcript has landed in the input box for the user to review/
  // edit — set on successful transcription, cleared on Send or Clear.
  const [voiceReviewPending, setVoiceReviewPending] = useState(false);
  // True once the user has explicitly confirmed the recap — freezes input during the
  // brief transition to /processing so nothing typed after confirming gets lost or
  // races the navigation.
  const [confirmed, setConfirmed] = useState(false);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const micSupported = useSyncExternalStore(subscribeNoop, micSupportSnapshot, micSupportServerSnapshot);

  const scrollRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const lastInputSource = useRef<InputSource>("typed");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const uiMode: "idle" | "recording" | "transcribing" | "review" = isListening
    ? "recording"
    : isProcessing
      ? "transcribing"
      : voiceReviewPending
        ? "review"
        : "idle";

  const missing: FieldKey | null = nextMissingField({
    name,
    destination,
    duration,
    travelDate,
    totalBudget,
    travelerCount,
    groupType,
    travelTheme,
  });

  function pushMessage(role: Message["role"], content: string) {
    addMessage({ id: newId(), role, content, timestamp: new Date() });
  }

  function speak(text: string) {
    // Streams via Sarvam's HTTP streaming TTS endpoint (lib/sarvam.ts's
    // ttsSynthesizeStream, proxied through GET /api/tts) — the browser's <audio>
    // element requests and plays it progressively, instead of the old fetch-JSON-
    // base64 round trip that had to wait for the entire clip before any sound played.
    audioRef.current?.pause();
    const url = `/api/tts?text=${encodeURIComponent(text)}&language=${language}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    // Autoplay can be blocked outside a direct user gesture in some browsers — the
    // text bubble is already visible either way, so this fails silently. A failed
    // stream (e.g. missing/invalid SARVAM_API_KEY) surfaces as a media error event,
    // not a thrown exception, so nothing extra to catch here.
    audio.play().catch(() => {});
  }

  // Pushes a bot/error message, and speaks it only when the user's own last turn was
  // voice — typing stays silent.
  function respond(role: "bot" | "error", content: string) {
    pushMessage(role, content);
    if (lastInputSource.current === "voice") {
      speak(content);
    }
  }

  function buildCollected(): Partial<Record<FieldKey, string | number>> {
    const collected: Partial<Record<FieldKey, string | number>> = {};
    if (name) collected.name = name;
    if (destination) collected.destination = destination;
    if (duration > 0) collected.duration = duration;
    if (travelDate) collected.travelDate = travelDate;
    if (totalBudget > 0) collected.budget = totalBudget;
    if (travelerCount > 0) collected.travelerCount = travelerCount;
    if (groupType) collected.groupType = groupType;
    if (travelTheme) collected.theme = travelTheme;
    return collected;
  }

  // Applies whatever fields a chat-turn (local or Claude-extracted) produced, in one
  // atomic store update — see store/useTripStore.ts's applyFields for why this needs
  // to be atomic rather than a sequence of setField calls (perPersonBudget).
  function applyChatTurnUpdates(updates: Partial<Record<FieldKey, string | number>>) {
    const patch: Partial<TripStore> = {};
    if (updates.name !== undefined) patch.name = String(updates.name);
    if (updates.destination !== undefined) patch.destination = String(updates.destination);
    if (updates.duration !== undefined) patch.duration = Number(updates.duration);
    if (updates.travelDate !== undefined) patch.travelDate = String(updates.travelDate);
    if (updates.budget !== undefined) patch.totalBudget = Number(updates.budget);
    if (updates.travelerCount !== undefined) patch.travelerCount = Number(updates.travelerCount);
    if (updates.groupType !== undefined) patch.groupType = updates.groupType as GroupType;
    if (updates.theme !== undefined) patch.travelTheme = updates.theme as TravelTheme;
    if (Object.keys(patch).length > 0) applyFields(patch);
  }

  // After a LOCAL (no-API-call) field update — a quick-chip tap — decides what to say
  // next by reading the store fresh (Zustand's set() is synchronous, so this reflects
  // the update just applied) and asking lib/fields.ts what's still missing. Never a
  // fixed "next step" — see lib/chatCopy.ts's askFor for why that broke down.
  function advanceAfterLocalUpdate() {
    const s = useTripStore.getState();
    const next = nextMissingField({
      name: s.name,
      destination: s.destination,
      duration: s.duration,
      travelDate: s.travelDate,
      totalBudget: s.totalBudget,
      travelerCount: s.travelerCount,
      groupType: s.groupType,
      travelTheme: s.travelTheme,
    });
    if (next === null) {
      respond("bot", t(chatCopy.readyToGenerate, language));
      return;
    }
    const ask = (chatCopy.askFor as Partial<Record<FieldKey, Bilingual>>)[next];
    if (ask) respond("bot", t(ask, language));
  }

  function applyLocalField<T extends string | number>(
    field: FieldKey,
    result: ValidationResult<T>,
    displayLabel: string,
  ) {
    lastInputSource.current = "typed"; // a tap is never voice-sourced
    pushMessage("user", displayLabel);
    if (!result.valid) {
      // Defense only — every quick chip passes an exact canonical value, so this
      // should never actually fire.
      respond("error", result.error!);
      return;
    }
    applyChatTurnUpdates({ [field]: result.value } as Partial<Record<FieldKey, string | number>>);
    advanceAfterLocalUpdate();
  }

  // Seed the conversation once.
  useEffect(() => {
    if (seeded.current || messages.length > 0) return;
    seeded.current = true;
    pushMessage("bot", t(chatCopy.greeting, language));
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

  function handleConfirmGenerate() {
    if (confirmed) return;
    setConfirmed(true);
    lastInputSource.current = "typed";
    respond("bot", t(chatCopy.generatingItinerary(destination), language));
    setTimeout(() => router.push("/processing"), 900);
  }

  function pickDuration(d: number) {
    applyLocalField<number>("duration", validateDuration(String(d), language), `${d} days`);
  }

  function pickBudget(option: { label: string; value: string }) {
    applyLocalField<number>("budget", parseBudget(option.value, language), option.label);
  }

  function pickGroupType(g: string) {
    applyLocalField<GroupType>("groupType", matchGroupType(g, language), g);
  }

  function handleThemeChipClick(theme: TravelTheme) {
    const meta = TRAVEL_THEMES.find((opt) => opt.theme === theme);
    applyLocalField<TravelTheme>("theme", { valid: true, value: theme }, `${meta?.emoji ?? ""} ${theme}`.trim());
  }

  // Every free-text turn — typed or a reviewed voice transcript — goes to the unified
  // endpoint with a snapshot of everything already collected. This is the one call
  // that replaces the old per-step local-parse-then-Claude-fallback pipeline; see the
  // file header for why free text can no longer stay local-only in a stepless flow.
  async function handleSubmit(raw: string, source: InputSource = "typed") {
    const text = raw.trim();
    if (!text || confirmed) return;

    setVoiceReviewPending(false);
    lastInputSource.current = source;
    pushMessage("user", text);
    setInputValue("");

    setField("isExtracting", true);
    try {
      const res = await fetch("/api/chat-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, language, collected: buildCollected() }),
      });
      const data = await res.json();

      if (!res.ok) {
        respond("error", t(chatCopy.errors.chatTurnFailed, language));
        return;
      }

      const updates = (data.updates ?? {}) as Partial<Record<FieldKey, string | number>>;
      const invalidMessages: string[] = Array.isArray(data.invalidMessages) ? data.invalidMessages : [];

      if (Object.keys(updates).length > 0) applyChatTurnUpdates(updates);

      // A field Claude claimed but that failed the server-side validator safety net
      // always wins over Claude's own drafted reply — same "mechanical rejection
      // reads as an error bubble, Claude's own words read as a normal bubble"
      // distinction the original red-bubble bug fix established.
      if (invalidMessages.length > 0) {
        invalidMessages.forEach((m) => respond("error", m));
      } else if (typeof data.reply === "string" && data.reply) {
        respond("bot", data.reply);
      }
    } catch {
      respond("error", t(chatCopy.errors.chatTurnFailed, language));
    } finally {
      setField("isExtracting", false);
    }
  }

  async function startRecording() {
    if (!micSupported || confirmed || isListening || isProcessing) return;
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
      setActiveStream(stream); // drives the live waveform (VoiceWaveform) in the input area
    } catch {
      lastInputSource.current = "voice";
      respond("error", t(chatCopy.mic.permissionDenied, language));
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;

    setField("isListening", false);
    setField("isProcessing", true);
    setActiveStream(null);

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
        respond("error", t(chatCopy.mic.silence, language));
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
          respond("error", data.error === "silence" ? t(chatCopy.mic.silence, language) : t(chatCopy.mic.unclear, language));
          return;
        }

        // Doesn't auto-submit: the transcript lands in the editable input box for the
        // user to review, edit, Send, or Clear.
        setInputValue(data.transcript);
        setVoiceReviewPending(true);
      } catch {
        setField("isProcessing", false);
        respond("error", t(chatCopy.mic.failed, language));
      }
    };

    mr.stop();
  }

  // Discards an in-progress recording without transcribing it — no onstop handler is
  // attached for this stop cycle (that only happens inside stopRecording), so the
  // browser just tears the recorder down and nothing gets sent to /api/stt.
  function cancelRecording() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setField("isListening", false);
    setActiveStream(null);
  }

  function handleMicClick() {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function clearVoiceReview() {
    setInputValue("");
    setVoiceReviewPending(false);
  }

  const chipsSuppressed = uiMode !== "idle" || confirmed;
  const showDurationChips = missing === "duration" && !chipsSuppressed;
  const showBudgetChips = missing === "budget" && !chipsSuppressed;
  const showGroupChips = missing === "groupType" && !chipsSuppressed;
  const showThemeChips = missing === "theme" && !chipsSuppressed;
  const showRecap = missing === null && !confirmed;

  const hint = (() => {
    if (uiMode === "review") return t(chatCopy.hints.reviewVoice, language);
    if (uiMode === "recording") return t(chatCopy.hints.listening, language);
    if (uiMode === "transcribing") return t(chatCopy.hints.transcribing, language);
    if (isExtracting) return t(chatCopy.hints.thinking, language);
    if (missing === null) return t(chatCopy.hints.ready, language);
    return t(chatCopy.hints[missing], language);
  })();

  const micTitle = !micSupported
    ? t(chatCopy.mic.unsupported, language)
    : uiMode === "recording"
      ? t(chatCopy.mic.tapToStop, language)
      : uiMode === "transcribing"
        ? t(chatCopy.hints.transcribing, language)
        : t(chatCopy.mic.tapToSpeak, language);

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
        <ProgressBar />
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-5">
        {messages.map((m) => (
          <div key={m.id} className="chat-bubble-enter">
            <ChatBubble role={m.role}>{m.content}</ChatBubble>
          </div>
        ))}

        {showDurationChips && (
          <div className="chat-chip-group-enter flex flex-wrap gap-2 pl-[34px]">
            {DURATION_QUICK_OPTIONS.map((d) => (
              <QuickChip key={d} label={`${d} days`} onClick={() => pickDuration(d)} />
            ))}
          </div>
        )}

        {showBudgetChips && (
          <div className="chat-chip-group-enter flex flex-wrap gap-2 pl-[34px]">
            {BUDGET_QUICK_OPTIONS.map((b) => (
              <QuickChip key={b.value} label={b.label} onClick={() => pickBudget(b)} />
            ))}
            <QuickChip label={t(chatCopy.quickChipCustom, language)} onClick={() => document.getElementById("chat-input")?.focus()} />
          </div>
        )}

        {showGroupChips && (
          <div className="chat-chip-group-enter flex flex-wrap gap-2 pl-[34px]">
            {GROUP_TYPE_OPTIONS.map((g) => (
              <QuickChip key={g} label={g} onClick={() => pickGroupType(g)} />
            ))}
          </div>
        )}

        {showThemeChips && (
          <div className="chat-chip-group-enter flex flex-wrap gap-2.5 pl-[34px]">
            {TRAVEL_THEMES.map(({ theme, emoji }) => (
              <ThemeChip key={theme} theme={theme} emoji={emoji} onClick={handleThemeChipClick} />
            ))}
          </div>
        )}

        {/* Mobile recap — desktop already has the always-visible TripSummaryCard in the
            right column below; this is the same component, reused inline in the message
            flow so the recap + explicit confirm step is reachable on mobile too. */}
        {showRecap && (
          <div className="pl-[34px] pr-1">
            <TripSummaryCard onConfirm={handleConfirmGenerate} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 pb-5 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="mb-2 pl-1 font-sans text-[11px] text-[#999]">{hint}</div>
        <div className="flex items-center gap-2.5">
          {uiMode === "recording" ? (
            <div className="flex h-[46px] flex-1 items-center rounded-full bg-tripoly-error/10 px-[18px]">
              <VoiceWaveform stream={activeStream} active={isListening} />
            </div>
          ) : (
            <input
              id="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit(inputValue, uiMode === "review" ? "voice" : "typed");
              }}
              disabled={confirmed || uiMode === "transcribing" || isExtracting}
              placeholder={t(chatCopy.placeholder, language)}
              className="h-[46px] flex-1 rounded-full bg-tripoly-bubble-offtopic px-[18px] font-sans text-sm text-tripoly-text placeholder:text-[#999] disabled:opacity-50"
            />
          )}

          {uiMode === "recording" && (
            <button
              type="button"
              onClick={cancelRecording}
              title={t(chatCopy.mic.cancel, language)}
              className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full bg-[#f2f2f2] text-tripoly-text transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}

          {uiMode === "review" && (
            <button
              type="button"
              onClick={clearVoiceReview}
              title={t(chatCopy.mic.clear, language)}
              className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full bg-[#f2f2f2] text-tripoly-text transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}

          {uiMode === "review" ? (
            <button
              type="button"
              onClick={() => handleSubmit(inputValue, "voice")}
              title={t(chatCopy.mic.send, language)}
              className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full bg-tripoly-green transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <div className="group relative flex-shrink-0">
              {/* Custom hover label — a native `title` tooltip is slow to appear, easy to
                  miss, and doesn't work at all on touch. This shows instantly on hover
                  and is always readable (also kept as `title` below for accessibility/
                  touch long-press). */}
              <div
                className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2.5 py-1 font-sans text-[11px] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                role="tooltip"
              >
                {micTitle}
              </div>
              <button
                type="button"
                disabled={!micSupported || confirmed || uiMode === "transcribing" || isExtracting}
                title={micTitle}
                onClick={handleMicClick}
                className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full transition-all ${
                  !micSupported || confirmed
                    ? "cursor-not-allowed bg-tripoly-green opacity-40"
                    : uiMode === "recording"
                      ? "scale-110 cursor-pointer bg-tripoly-error shadow-[0_0_0_6px_rgba(239,68,68,0.15)]"
                      : uiMode === "transcribing"
                        ? "cursor-wait bg-tripoly-green opacity-60"
                        : "cursor-pointer bg-tripoly-green"
                }`}
              >
                {uiMode === "recording" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" fill="#fff" />
                    <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Right column — desktop only. Section 13: "Right: live trip summary card updating
          as user answers." Now also carries the explicit confirm button once complete. */}
      <div className="hidden lg:flex lg:flex-1 lg:items-start lg:justify-center lg:bg-[#fafafa] lg:p-10">
        <div className="w-full max-w-[420px] lg:sticky lg:top-10">
          <TripSummaryCard onConfirm={handleConfirmGenerate} />
        </div>
      </div>
    </main>
  );
}
