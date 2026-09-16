// Unified per-turn Claude call — server-only. Called exclusively from
// app/api/chat-turn/route.ts, which is where ANTHROPIC_API_KEY is read; never
// exposed to the client.
//
// Supersedes lib/fieldExtraction.ts (the Option A single-field detour-aware fallback).
// That design only ever asked Claude about ONE field at a time, and only when the
// local regex parse in lib/validators.ts had already failed — which is exactly what
// made the old ChatScreen feel like a rigid form with an AI veneer: something said
// two questions ago was invisible to the fallback call three turns later, so the
// assistant would re-ask for it. Full pure-conversational rebuild (confirmed with
// you): every free-text turn now goes through this ONE call, which always receives a
// snapshot of everything already collected, and can return zero, one, or several
// field updates from a single message (e.g. "Kaushik, going to Bali for 5 days" in
// one go) plus an always-present, always-in-language natural reply. The cost/latency
// tradeoff of calling Claude on every turn — even a bare "Kaushik" — instead of only
// on parse failure, is the real, acknowledged tradeoff of the pure-conversational
// rebuild you chose over the smaller contained fix.
//
// Every claimed field update is re-verified server-side (app/api/chat-turn/route.ts)
// through the same lib/validators.ts bounds checks used everywhere else — this module
// only asks Claude to extract and converse, it never becomes the source of truth for
// whether a value is actually valid.

import type { Language } from "@/store/useTripStore";
import { stripMarkdownFences } from "@/lib/claude";
import { FIELD_PRIORITY, type FieldKey } from "@/lib/fields";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// Higher than fieldExtraction.ts's old 400: a reply now may need to acknowledge
// several just-extracted fields, answer a detour, AND ask the next question, in
// either language.
const MAX_TOKENS = 500;
const ANTHROPIC_VERSION = "2023-06-01";

export interface ChatTurnResult {
  updates: Partial<Record<FieldKey, string | number>>;
  reply: string;
}

// Extraction rules — reused verbatim from lib/fieldExtraction.ts's proven FIELD_RULES
// (the wording that was already live-tested for Hindi/mixed-language/natural-phrasing
// handling), generalized from "the one field being asked about" to "any of these you
// can find in the message."
const FIELD_RULES: Record<FieldKey, string> = {
  name: `The traveler's own name. Accept any language/script. Strip filler like
"my name is", "I am", "this is", "this side", "call me" — in English, Hindi, or
mixed — regardless of exact wording. Return just the name itself, in the script
it was given.`,
  destination: `The place they want to travel to. Return the destination's
standard English name, correctly capitalized (e.g. "थाईलैंड" -> "Thailand",
"goa" -> "Goa"), regardless of what language/script it was given in — the rest
of the app displays destinations in English.`,
  duration: `The trip length in days, as an integer from 1 to 10 inclusive.
Understand digits (Arabic or Devanagari) and number words in English or Hindi,
anywhere in the sentence (e.g. "around 8 days", "8 din", "आठ दिन").`,
  budget: `The total trip budget in Indian Rupees, as an integer, minimum 1000.
Understand "lakh"/"lakhs" (or Hindi "लाख"), "thousand"/"हज़ार", plain digits
(Arabic or Devanagari), and shorthand like "2L", in English, Hindi, or mixed.`,
  travelerCount: `The number of travelers, as an integer from 1 to 50 inclusive.
Understand digits and number words in English or Hindi, anywhere in the
sentence (e.g. "we are 4 people", "hum 4 log hain").`,
  groupType: `Match to exactly one of these four values: "Family", "Couple",
"Friends", "Solo". Understand casual/indirect phrasing and Hindi equivalents
(e.g. "just my wife and me" -> Couple, "with my parents and kids" -> Family,
"by myself" -> Solo, "दोस्तों के साथ" -> Friends).`,
  theme: `Match to exactly one of these five values: "Relaxed", "Adventure",
"Romantic", "Family", "Foodie". Understand casual phrasing and Hindi
equivalents (e.g. "chill trip" -> Relaxed, "want to try local food" -> Foodie,
"kuch adventurous" -> Adventure).`,
};

// Plain-language description of each field, for prompt context only — never shown to
// the user verbatim.
const FIELD_LABELS: Record<FieldKey, string> = {
  name: "the traveler's own name",
  destination: "which destination they want to travel to",
  duration: "how many days their trip will be (1 to 10)",
  budget: "their total trip budget, in Indian Rupees",
  travelerCount: "how many people are traveling (1 to 50)",
  groupType: "their group type — Family, Couple, Friends, or Solo",
  theme: "what kind of trip they want — Relaxed, Adventure, Romantic, Family, or Foodie",
};

function describeCollected(collected: Partial<Record<FieldKey, string | number>>): string {
  const entries = FIELD_PRIORITY
    .filter((f) => collected[f] !== undefined)
    .map((f) => `- ${FIELD_LABELS[f]}: already have "${collected[f]}"`);
  if (entries.length === 0) {
    return "Nothing yet — this is the very first real answer in the conversation.";
  }
  return entries.join("\n");
}

function buildPrompt(
  message: string,
  language: Language,
  collected: Partial<Record<FieldKey, string | number>>,
): string {
  const languageName = language === "HI" ? "Hindi (Devanagari script)" : "English";
  const missing = FIELD_PRIORITY.filter((f) => collected[f] === undefined);
  const rulesBlock = FIELD_PRIORITY.map((f) => `- ${f}: ${FIELD_RULES[f]}`).join("\n\n");
  const missingBlock = missing.length
    ? missing.map((f) => `- ${FIELD_LABELS[f]}`).join("\n")
    : "Nothing — every field is already collected. If they're not asking to change anything, just acknowledge warmly, don't ask another question.";

  return `
You are Tripoly's trip-planning chat assistant, having a natural, free-flowing
conversation with a traveler while gathering the details needed to plan their
trip. Unlike a rigid form, the traveler can answer in any order, give several
details in one message, ask questions, or change something they already told
you — respond like a knowledgeable, attentive human travel assistant would,
never like a script working through a checklist out loud.

Respond ONLY in ${languageName} — that's the app's active language, chosen by
the user, and every reply you write must be in it, no matter what script the
user's own message used.

Fields you're collecting, and how to recognize a valid answer for each:
${rulesBlock}

What's already been collected in this conversation — do NOT ask for any of
these again, and do NOT re-extract them from this message, unless the
traveler's new message is clearly and explicitly correcting or changing one
of them:
${describeCollected(collected)}

Still needed (only ask for ONE of these next — the first one below that fits
naturally — in a single short conversational question; never list several at
once, never sound like a form):
${missingBlock}

The traveler's latest message: "${message}"

Your job, in one response:
1. Look at the message. Extract every field above you can confidently
   determine from it RIGHT NOW — this could be none, one, or several at once
   (e.g. a message might give a name AND a destination together). Only
   extract a field that's either currently missing, or that the message is
   clearly, explicitly changing from what's already collected — never
   reinterpret unrelated text as an accidental correction.
2. Write ONE natural, warm reply in ${languageName} that:
   - Briefly acknowledges anything you just extracted — don't just echo it
     back mechanically, and don't over-explain.
   - If the message asked a genuine trip-planning question or wanted a
     suggestion (e.g. "what's good in June?", "kaunsa desh accha rahega
     Middle East mein?"), answer it helpfully and specifically in a sentence
     or two.
   - If it went further off-topic (jokes, coding, unrelated trivia — nothing
     to do with travel), politely decline in one sentence — Tripoly's
     assistant only helps with trip planning.
   - Then, unless every field is already collected, naturally ask for the
     single next missing field listed above — phrase it conversationally,
     never like a form field label, and never ask about something already
     collected.

Return ONLY this exact JSON, no markdown, no explanation:
{ "updates": { "<field>": <extracted value> }, "reply": "<your full reply, entirely in ${languageName}>" }

"updates" keys must only be drawn from this exact set: ${FIELD_PRIORITY.join(", ")}.
Use {} for "updates" if nothing new was confidently extracted this turn.
`.trim();
}

/** One turn of the unified chat — extracts any confidently-found fields plus a reply. Throws on API/network failure. */
export async function chatTurn(
  message: string,
  language: Language,
  collected: Partial<Record<FieldKey, string | number>>,
): Promise<ChatTurnResult> {
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
      messages: [{ role: "user", content: buildPrompt(message, language, collected) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude chat-turn failed (${res.status}): ${await res.text()}`);
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
    throw new Error(`Claude chat-turn response was not valid JSON: ${jsonText.slice(0, 300)}`);
  }

  const result = parsed as Partial<ChatTurnResult>;
  return {
    updates: result.updates && typeof result.updates === "object" ? result.updates : {},
    reply: typeof result.reply === "string" ? result.reply : "",
  };
}
