// Claude-based fallback field extraction — server-only. Called exclusively from
// app/api/extract-field/route.ts, which is where ANTHROPIC_API_KEY is read; never
// exposed to the client.
//
// Why this exists: lib/validators.ts's local regex-based parsing is the fast path
// (instant, free) and stays exactly as-is for clean/simple answers — quick-chip
// taps, bare numbers, exact formats, and common English natural phrasing it already
// handles. Live testing surfaced two things regex fundamentally can't fix by adding
// more patterns: (1) the letters-only/digit-only regexes reject Hindi (Devanagari
// script) outright, and (2) open-ended phrasing ("this side Kaushik") is an
// unbounded set — no fixed pattern list ever fully covers it. Both are the same
// root cause: understanding free-form natural language in any language needs
// actual language understanding, not more regex. So ChatScreen calls this ONLY
// when the local parse in lib/validators.ts fails — the common/simple case never
// pays the extra network round trip, and everything else gets real understanding
// instead of a guess.
//
// Option A redesign: this used to just extract-or-reject, with the rejection
// message always in English ("one short, friendly sentence... in English"). Two
// changes, applied uniformly to every field via the one shared prompt below:
//   1. The reply — success or failure — is now always in the app's active
//      language (the `language` param), not hardcoded English, regardless of
//      what script the user typed/spoke in.
//   2. When no value can be extracted, instead of a flat "please provide X"
//      template, Claude is instructed to actually engage: answer a genuine
//      trip-planning question or suggestion request helpfully, then steer back
//      to what's still needed — this is what replaces the old blunt
//      isLikelyOffTopic() gate (removed from ChatScreen) for real questions,
//      while still declining anything genuinely unrelated to travel.
// This reuses the exact extractField()/resolveField() call sites already wired
// into all 7 chat-flow fields — no new endpoint, no new architecture.

import type { Language } from "@/store/useTripStore";
import { stripMarkdownFences } from "@/lib/claude";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// Bumped from 300: a genuinely helpful conversational reply (answering a real
// question, then steering back) runs longer than a template rejection, and
// Devanagari text costs more tokens per word than English.
const MAX_TOKENS = 400;
const ANTHROPIC_VERSION = "2023-06-01";

export type FieldKey =
  | "name"
  | "destination"
  | "duration"
  | "budget"
  | "travelerCount"
  | "groupType"
  | "theme"
  | "confirm";

export interface FieldExtractionResult {
  valid: boolean;
  value?: string | number;
  error?: string;
}

const FIELD_RULES: Record<FieldKey, string> = {
  name: `The traveler's own name only. Accept any language/script. Strip filler like
"my name is", "I am", "this is", "this side", "call me" — in English, Hindi, or
mixed — regardless of exact wording. Return just the name itself, in the script
it was given.
Reject (valid:false) if the input is not a plausible name (a question, gibberish,
or unrelated text).`,
  destination: `The place they want to travel to. Return the destination's
standard English name, correctly capitalized (e.g. "थाईलैंड" -> "Thailand",
"goa" -> "Goa"), regardless of what language/script it was given in — the rest
of the app displays destinations in English.
Reject (valid:false) if no real place is mentioned.`,
  duration: `The trip length in days, as an integer from 1 to 10 inclusive.
Understand digits (Arabic or Devanagari) and number words in English or Hindi,
anywhere in the sentence (e.g. "around 8 days", "8 din", "आठ दिन").
Reject (valid:false) if no number in that range can be found.`,
  budget: `The total trip budget in Indian Rupees, as an integer, minimum 1000.
Understand "lakh"/"lakhs" (or Hindi "लाख"), "thousand"/"हज़ार", plain digits
(Arabic or Devanagari), and shorthand like "2L", in English, Hindi, or mixed.
Reject (valid:false) if no budget amount can be determined.`,
  travelerCount: `The number of travelers, as an integer from 1 to 50 inclusive.
Understand digits and number words in English or Hindi, anywhere in the
sentence (e.g. "we are 4 people", "hum 4 log hain").
Reject (valid:false) if no number in that range can be found.`,
  groupType: `Match to exactly one of these four values: "Family", "Couple",
"Friends", "Solo". Understand casual/indirect phrasing and Hindi equivalents
(e.g. "just my wife and me" -> Couple, "with my parents and kids" -> Family,
"by myself" -> Solo, "दोस्तों के साथ" -> Friends).
Reject (valid:false) if it doesn't clearly map to one of the four.`,
  theme: `Match to exactly one of these five values: "Relaxed", "Adventure",
"Romantic", "Family", "Foodie". Understand casual phrasing and Hindi
equivalents (e.g. "chill trip" -> Relaxed, "want to try local food" -> Foodie,
"kuch adventurous" -> Adventure).
Reject (valid:false) if it doesn't clearly map to one of the five.`,
  confirm: `The user is answering a yes/no confirmation question. Determine
whether their reply is affirmative or negative, in any language or script
(English, Hindi/Devanagari, or Hinglish — e.g. "haan"/"हाँ" -> yes,
"nahi"/"नहीं" -> no). Return the value as exactly "yes" or "no".
Reject (valid:false) only if the reply is genuinely ambiguous or doesn't
answer yes/no at all.`,
};

// Plain-language description of what's currently being asked, for Claude to
// naturally steer the conversation back to after handling a detour — not shown
// to the user verbatim, just context for how to phrase the steer-back.
const FIELD_ASK: Record<FieldKey, string> = {
  name: "the traveler's own name",
  destination: "which destination they want to travel to",
  duration: "how many days their trip will be (1 to 10)",
  budget: "their total trip budget, in Indian Rupees",
  travelerCount: "how many people are traveling (1 to 50)",
  groupType: "their group type — Family, Couple, Friends, or Solo",
  theme: "what kind of trip they want — Relaxed, Adventure, Romantic, Family, or Foodie",
  confirm: "whether their previous answer was correct",
};

function buildPrompt(field: FieldKey, rawInput: string, language: Language): string {
  const languageName = language === "HI" ? "Hindi (Devanagari script)" : "English";
  return `
You are Tripoly's trip-planning chat assistant, talking naturally with a
traveler while collecting their trip details one question at a time. Right
now you're asking them for: ${FIELD_ASK[field]}.

Field: ${field}
Extraction rules: ${FIELD_RULES[field]}

Respond ONLY in ${languageName} — that's the app's active language, chosen by
the user, and every reply you write must be in it, no matter what script the
user's own message used.

User's raw answer: "${rawInput}"

Two cases:
1. A valid value can be extracted per the rules above -> return it.
2. It can't — because the answer doesn't contain that value, or because the
   user asked an unrelated question, asked for a suggestion, or said
   something conversational instead of answering. In this case, do NOT return
   a flat "please provide X" template. Actually engage, like a helpful human
   travel assistant would:
   - If they asked a genuine trip-planning question or wanted a suggestion
     (e.g. "kaunsa desh accha rahega Middle East mein?", "what's good in
     June?"), answer it helpfully and specifically in a sentence or two, then
     naturally bring the conversation back to what you still need from them.
   - If it's just unclear, empty, or doesn't make sense, ask for it again
     warmly, in one short sentence — no stock phrasing.
   - If they go further off-topic (jokes, coding, unrelated trivia, anything
     with no connection to travel), politely decline in one sentence and
     steer back to the question — Tripoly's assistant only helps with trip
     planning.
   Put this entire reply in the "error" field, fully in ${languageName}.

Return ONLY this exact JSON, no markdown, no explanation:
{ "valid": true, "value": <the extracted value> }
or
{ "valid": false, "error": "<your full reply to the user, entirely in ${languageName}>" }
`.trim();
}

/** Claude-based fallback extraction for one chat-flow field. Throws on API/network failure. */
export async function extractField(
  field: FieldKey,
  rawInput: string,
  language: Language,
): Promise<FieldExtractionResult> {
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
      messages: [{ role: "user", content: buildPrompt(field, rawInput, language) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude field extraction failed (${res.status}): ${await res.text()}`);
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
    throw new Error(`Claude field extraction response was not valid JSON: ${jsonText.slice(0, 300)}`);
  }

  return parsed as FieldExtractionResult;
}
