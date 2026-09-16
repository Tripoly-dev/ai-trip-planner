"use client";

// Screen 3 — Voice + Text Chat. Per TRIPOLY_HANDOFF.md section 7 (layout) and
// section 10 (Sarvam AI integration). Section 8's validation rules are now
// implemented via lib/validators.ts (local fast path) + lib/fieldExtraction.ts
// (Claude fallback) rather than literally, per the Option A redesign below.
//
// Option A redesign (this file's current shape) — replaces the original scripted-
// form behavior after live testing showed it didn't hold up in Hindi or against
// any phrasing it hadn't anticipated:
//  - No more rule-based off-topic gate (isLikelyOffTopic/OFF_TOPIC_MESSAGE). A
//    genuine question or detour now falls through to the Claude fallback in
//    lib/fieldExtraction.ts, which answers it helpfully and steers back, in the
//    active language — instead of a blunt "I can only help you plan your trip"
//    bounce. (isLikelyOffTopic/OFF_TOPIC_MESSAGE still exist in lib/validators.ts,
//    unchanged, for ItineraryScreen's separate amendment-box check.)
//  - No more pendingConfirm / "I heard 'X'. Is that correct?" step, for any field,
//    including Budget (which used to always confirm, typed or voice). A voice
//    answer now goes through a review step instead (below) — since the user can
//    already see and edit the transcribed text before it's ever submitted, a
//    separate confirm-back turn was redundant.
//  - Every bot line and local-validator error is now bilingual, picked from
//    lib/chatCopy.ts via the live `language` toggle at the moment each message is
//    generated — not hardcoded English. Language can change freely between
//    questions; nothing is "locked in."
//  - Mic UX rebuilt: tap-to-toggle instead of press-and-hold, a live waveform
//    shown in the input area (not the mic button) while recording, a Cancel
//    button during recording, and a review step after transcription — the
//    transcript lands in the editable input box instead of auto-submitting, with
//    a Send (✓) button to submit it as typed/edited, or Clear (✕) to discard it.
//  - TTS still only auto-plays for bot replies that follow a voice-sourced user
//    turn (a submitted voice review counts as voice-sourced) — typing stays
//    silent/text-only.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeChip } from "@/components/ui/ThemeChip";
import { TripolyMark } from "@/components/ui/TripolyMark";
import { TripSummaryCard } from "@/components/ui/TripSummaryCard";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { chatCopy, t } from "@/lib/chatCopy";
import { TRAVEL_THEMES } from "@/lib/constants";
import type { FieldKey } from "@/lib/fieldExtraction";
import {
  matchGroupType,
  parseBudget,
  validateDestination,
  validateDuration,
  validateName,
  validateTravelerCount,
  type ValidationResult,
} from "@/lib/validators";
import { useTripStore, type GroupType, type Message, type TravelTheme } from "@/store/useTripStore";

type TravelerSubStep = "count" | "group";
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
  const isExtracting = useTripStore((s) => s.isExtracting);

  const [inputValue, setInputValue] = useState("");
  const [travelerSubStep, setTravelerSubStep] = useState<TravelerSubStep>("count");
  // True once a voice transcript has landed in the input box for the user to review/
  // edit — set on successful transcription, cleared on Send or Clear. Replaces the
  // old pendingConfirm mechanism: the user reviews the text itself instead of the
  // bot re-asking "is that correct?".
  const [voiceReviewPending, setVoiceReviewPending] = useState(false);
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

  // Pushes a bot/error message, and speaks it only when the user's own last turn
  // was voice — typing stays silent (unchanged from the original Step 6 decision).
  function respond(role: "bot" | "error" | "offtopic", content: string) {
    pushMessage(role, content);
    if (lastInputSource.current === "voice") {
      speak(content);
    }
  }

  // Falls back to Claude-based extraction (lib/fieldExtraction.ts) only when the local
  // regex parse in lib/validators.ts couldn't confidently handle the answer — clean/
  // simple input (quick-chip taps, bare numbers, exact formats, common English phrasing)
  // never pays the extra round trip; anything else (Hindi, mixed language, unanticipated
  // phrasing, or a genuine question/detour) gets real understanding instead of a hard
  // fail — including a helpful, in-language conversational reply for detours, per the
  // redesigned prompt in lib/fieldExtraction.ts.
  async function resolveField<T>(
    field: FieldKey,
    text: string,
    localResult: ValidationResult<T>,
  ): Promise<ValidationResult<T>> {
    if (localResult.valid) return localResult;
    setField("isExtracting", true);
    try {
      const res = await fetch("/api/extract-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, rawInput: text, language }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        return { valid: true, value: data.value as T };
      }
      return { valid: false, error: (typeof data.error === "string" && data.error) || localResult.error };
    } catch {
      // Network/API failure — fall back to the original local error rather than
      // blocking silently.
      return localResult;
    } finally {
      setField("isExtracting", false);
    }
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

  function commitTheme(theme: TravelTheme) {
    setField("travelTheme", theme);
    respond("bot", t(chatCopy.generatingItinerary(destination), language));
    setTimeout(() => router.push("/processing"), 900);
  }

  function handleThemeChipClick(theme: TravelTheme) {
    const meta = TRAVEL_THEMES.find((opt) => opt.theme === theme);
    lastInputSource.current = "typed"; // a tap is never voice-sourced
    pushMessage("user", `${meta?.emoji ?? ""} ${theme}`.trim());
    commitTheme(theme);
  }

  async function handleSubmit(raw: string, source: InputSource = "typed") {
    const text = raw.trim();
    if (!text || travelTheme) return;

    // Any submit — typed, chip tap, or a reviewed voice transcript — ends the
    // review state, if one was in progress.
    setVoiceReviewPending(false);
    lastInputSource.current = source;
    pushMessage("user", text);
    setInputValue("");

    switch (currentStep) {
      case 1: {
        const local = validateName(text, language);
        const extracted = await resolveField("name", text, local);
        if (!extracted.valid) return respond("error", extracted.error!);
        const name = String(extracted.value).trim();
        if (name.length < 2) {
          return respond("error", t(chatCopy.errors.nameTooShortAfterExtraction, language));
        }
        setField("name", name);
        respond("bot", t(chatCopy.afterName(name), language));
        setStep(2);
        return;
      }
      case 2: {
        const local = validateDestination(text, language);
        const extracted = await resolveField("destination", text, local);
        if (!extracted.valid) return respond("error", extracted.error!);
        const destinationValue = String(extracted.value).trim();
        if (destinationValue.length < 3) {
          return respond("error", t(chatCopy.errors.destinationTooShort, language));
        }
        setField("destination", destinationValue);
        respond("bot", t(chatCopy.afterDestination, language));
        setStep(3);
        return;
      }
      case 3: {
        const local = validateDuration(text, language);
        const extracted = await resolveField("duration", text, local);
        if (!extracted.valid) return respond("error", extracted.error!);
        // Re-run the extracted value through the same bounds check regardless of
        // source (a no-op when it already came from the local path; a real safety
        // net against an out-of-range value from the Claude fallback).
        const r = validateDuration(String(extracted.value), language);
        if (!r.valid) return respond("error", r.error!);
        setField("duration", r.value!);
        respond("bot", t(chatCopy.afterDuration, language));
        setStep(4);
        return;
      }
      case 4: {
        const local = parseBudget(text, language);
        const extracted = await resolveField("budget", text, local);
        if (!extracted.valid) return respond("error", extracted.error!);
        const r = parseBudget(String(extracted.value), language);
        if (!r.valid) return respond("error", r.error!);
        setField("totalBudget", r.value!);
        respond("bot", t(chatCopy.afterBudget, language));
        setTravelerSubStep("count");
        setStep(5);
        return;
      }
      case 5: {
        if (travelerSubStep === "count") {
          const local = validateTravelerCount(text, language);
          const extracted = await resolveField("travelerCount", text, local);
          if (!extracted.valid) return respond("error", extracted.error!);
          const r = validateTravelerCount(String(extracted.value), language);
          if (!r.valid) return respond("error", r.error!);
          setField("travelerCount", r.value!);
          setField("perPersonBudget", Math.round(totalBudget / r.value!));
          respond("bot", t(chatCopy.afterTravelerCount, language));
          setTravelerSubStep("group");
          return;
        }
        const local = matchGroupType(text, language);
        const extracted = await resolveField<GroupType>("groupType", text, local);
        if (!extracted.valid) return respond("error", extracted.error!);
        // Claude is instructed to return exactly one of the four canonical labels —
        // re-run it through the existing exact-match check as a safety net rather
        // than trusting the API response verbatim.
        const r = matchGroupType(String(extracted.value), language);
        if (!r.valid) return respond("error", t(chatCopy.errors.groupTypeChoice, language));
        setField("groupType", r.value!);
        respond("bot", t(chatCopy.afterGroupType, language));
        setStep(6);
        return;
      }
      case 6: {
        const localMatch = TRAVEL_THEMES.find((opt) => opt.theme.toLowerCase() === text.toLowerCase());
        const local: ValidationResult<TravelTheme> = localMatch
          ? { valid: true, value: localMatch.theme }
          : { valid: false, error: t(chatCopy.errors.themeChoice, language) };
        const extracted = await resolveField<TravelTheme>("theme", text, local);
        if (!extracted.valid) return respond("error", extracted.error!);
        // Same re-verification pattern as Group Type — confirm Claude's answer maps
        // to one of the five real theme values rather than trusting it verbatim.
        const match = TRAVEL_THEMES.find((opt) => opt.theme.toLowerCase() === String(extracted.value).toLowerCase());
        if (!match) return respond("error", t(chatCopy.errors.themeChoice, language));
        commitTheme(match.theme);
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

        // Doesn't auto-submit: the transcript lands in the editable input box for
        // the user to review, edit, Send, or Clear — replaces the old confirm-back
        // step (see file header).
        setInputValue(data.transcript);
        setVoiceReviewPending(true);
      } catch {
        setField("isProcessing", false);
        respond("error", t(chatCopy.mic.failed, language));
      }
    };

    mr.stop();
  }

  // Discards an in-progress recording without transcribing it — no onstop handler
  // is attached for this stop cycle (that only happens inside stopRecording), so
  // the browser just tears the recorder down and nothing gets sent to /api/stt.
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

  const chipsSuppressed = uiMode !== "idle";
  const showDurationChips = currentStep === 3 && !chipsSuppressed;
  const showBudgetChips = currentStep === 4 && !chipsSuppressed;
  const showGroupChips = currentStep === 5 && travelerSubStep === "group" && !chipsSuppressed;
  const showThemeChips = currentStep === 6 && !travelTheme && !chipsSuppressed;

  const hint = (() => {
    if (uiMode === "review") return t(chatCopy.hints.reviewVoice, language);
    if (uiMode === "recording") return t(chatCopy.hints.listening, language);
    if (uiMode === "transcribing") return t(chatCopy.hints.transcribing, language);
    if (isExtracting) return t(chatCopy.hints.thinking, language);
    switch (currentStep) {
      case 1: return t(chatCopy.hints.name, language);
      case 2: return t(chatCopy.hints.destination, language);
      case 3: return t(chatCopy.hints.duration, language);
      case 4: return t(chatCopy.hints.budget, language);
      case 5: return travelerSubStep === "count" ? t(chatCopy.hints.travelerCount, language) : t(chatCopy.hints.groupType, language);
      case 6: return t(chatCopy.hints.theme, language);
      default: return "";
    }
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
            <QuickChip label={t(chatCopy.quickChipCustom, language)} onClick={() => document.getElementById("chat-input")?.focus()} />
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
              disabled={!!travelTheme || uiMode === "transcribing" || isExtracting}
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
                disabled={!micSupported || !!travelTheme || uiMode === "transcribing" || isExtracting}
                title={micTitle}
                onClick={handleMicClick}
                className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full transition-all ${
                  !micSupported || travelTheme
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
          as user answers." */}
      <div className="hidden lg:flex lg:flex-1 lg:items-start lg:justify-center lg:bg-[#fafafa] lg:p-10">
        <div className="w-full max-w-[420px] lg:sticky lg:top-10">
          <TripSummaryCard />
        </div>
      </div>
    </main>
  );
}
