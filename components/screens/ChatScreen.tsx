"use client";

// Screen 3 — Voice + Text Chat. Per TRIPOLY_HANDOFF.md section 7 (layout) and section 8
// (validation rules). UI + conversation state machine only (Step 5) — no Sarvam STT/TTS
// (Step 6) or Claude destination/off-topic checks (Step 7) yet. The mic button is
// present but inert until Step 6 wires real recording.
//
// Two interpretation calls made with your sign-off:
//  - Travelers + Group Type (one progress-bar segment) are collected as two sequential
//    bot turns rather than parsed from one freeform message — far more reliable pre-Step-7.
//  - The mockup's conversation-starter chips ("Plan a Bali trip", ...) are omitted —
//    their behavior isn't defined anywhere in the written spec.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ThemeChip } from "@/components/ui/ThemeChip";
import { TripolyMark } from "@/components/ui/TripolyMark";
import { TRAVEL_THEMES } from "@/lib/constants";
import {
  formatINR,
  matchGroupType,
  parseBudget,
  validateDestination,
  validateDuration,
  validateName,
  validateTravelerCount,
} from "@/lib/validators";
import { useTripStore, type Message, type TravelTheme } from "@/store/useTripStore";

type TravelerSubStep = "count" | "group";

const DURATION_QUICK_OPTIONS = [5, 7, 10];
const BUDGET_QUICK_OPTIONS = [
  { label: "₹50k", value: "50000" },
  { label: "₹1 lakh", value: "100000" },
  { label: "₹2 lakhs", value: "200000" },
];
const GROUP_TYPE_OPTIONS = ["Family", "Couple", "Friends", "Solo"] as const;

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
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

  const [inputValue, setInputValue] = useState("");
  const [travelerSubStep, setTravelerSubStep] = useState<TravelerSubStep>("count");
  const [pendingBudgetConfirm, setPendingBudgetConfirm] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  function pushMessage(role: Message["role"], content: string) {
    addMessage({ id: newId(), role, content, timestamp: new Date() });
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

  function commitTheme(theme: TravelTheme) {
    setField("travelTheme", theme);
    pushMessage("bot", `Perfect! Generating your ${destination || "trip"} itinerary now... ✨`);
    setTimeout(() => router.push("/processing"), 900);
  }

  function handleThemeChipClick(theme: TravelTheme) {
    const meta = TRAVEL_THEMES.find((t) => t.theme === theme);
    pushMessage("user", `${meta?.emoji ?? ""} ${theme}`.trim());
    commitTheme(theme);
  }

  function handleSubmit(raw: string) {
    const text = raw.trim();
    if (!text || travelTheme) return;

    pushMessage("user", text);
    setInputValue("");

    // Budget confirm-back takes priority regardless of step (it's a sub-turn of step 4).
    if (pendingBudgetConfirm !== null) {
      if (/^(y|yes|yeah|yep|correct|right)\b/i.test(text)) {
        setField("totalBudget", pendingBudgetConfirm);
        setPendingBudgetConfirm(null);
        pushMessage("bot", "Great! How many travelers?");
        setTravelerSubStep("count");
        setStep(5);
      } else if (/^(n|no|nope|wrong)\b/i.test(text)) {
        setPendingBudgetConfirm(null);
        pushMessage("bot", "No worries — what's your total trip budget?");
      } else {
        pushMessage("error", "Please answer yes or no.");
      }
      return;
    }

    switch (currentStep) {
      case 1: {
        const r = validateName(text);
        if (!r.valid) return pushMessage("error", r.error!);
        setField("name", r.value!);
        pushMessage("bot", `Great ${r.value}! Where would you like to travel?`);
        setStep(2);
        return;
      }
      case 2: {
        const r = validateDestination(text);
        if (!r.valid) return pushMessage("error", r.error!);
        setField("destination", r.value!);
        pushMessage("bot", "How many days are you planning? (max 10 days)");
        setStep(3);
        return;
      }
      case 3: {
        const r = validateDuration(text);
        if (!r.valid) return pushMessage("error", r.error!);
        setField("duration", r.value!);
        pushMessage("bot", "What is your total trip budget?");
        setStep(4);
        return;
      }
      case 4: {
        const r = parseBudget(text);
        if (!r.valid) return pushMessage("error", r.error!);
        setPendingBudgetConfirm(r.value!);
        pushMessage("bot", `I heard ${formatINR(r.value!)} as your total budget. Is that correct?`);
        return;
      }
      case 5: {
        if (travelerSubStep === "count") {
          const r = validateTravelerCount(text);
          if (!r.valid) return pushMessage("error", r.error!);
          setField("travelerCount", r.value!);
          setField("perPersonBudget", Math.round(totalBudget / r.value!));
          pushMessage("bot", "And what's your group type?");
          setTravelerSubStep("group");
          return;
        }
        const r = matchGroupType(text);
        if (!r.valid) return pushMessage("error", r.error!);
        setField("groupType", r.value!);
        pushMessage("bot", "Almost there! What kind of trip are you looking for?");
        setStep(6);
        return;
      }
      case 6: {
        const match = TRAVEL_THEMES.find((t) => t.theme.toLowerCase() === text.toLowerCase());
        if (!match) return pushMessage("error", "Please pick one of the options below.");
        commitTheme(match.theme);
        return;
      }
    }
  }

  const showDurationChips = currentStep === 3;
  const showBudgetChips = currentStep === 4 && pendingBudgetConfirm === null;
  const showGroupChips = currentStep === 5 && travelerSubStep === "group";
  const showThemeChips = currentStep === 6 && !travelTheme;

  const hint = (() => {
    if (pendingBudgetConfirm !== null) return "Reply yes or no";
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

  return (
    <main className="flex min-h-dvh flex-col bg-white">
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
            disabled={!!travelTheme}
            placeholder="Type or speak your answer..."
            className="h-[46px] flex-1 rounded-full bg-tripoly-bubble-offtopic px-[18px] font-sans text-sm text-tripoly-text placeholder:text-[#999] disabled:opacity-50"
          />
          <button
            type="button"
            disabled
            title="Voice input arrives in Step 6"
            className="flex h-[46px] w-[46px] flex-shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-tripoly-green opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" fill="#fff" />
              <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}
