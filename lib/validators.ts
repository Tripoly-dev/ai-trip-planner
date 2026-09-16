// All input validation + parsing for the 6-step chat flow.
// Per TRIPOLY_HANDOFF.md section 8. Applies identically to typed and voice-transcribed
// text (voice arrives as text once Step 6 wires Sarvam STT, so these functions don't
// need to know which source it came from).
//
// Context extraction (found needed during live testing after Step 12): early versions
// of these validators required the ENTIRE input to match an exact format — "8" was
// accepted for duration but "around 8 days" was rejected outright, and the name field
// stored "My name is Kaushik" verbatim instead of pulling out "Kaushik". Real typed/
// spoken answers are rarely that terse, so every validator below now extracts the
// relevant value from natural phrasing (a lead-in phrase for Name/Destination, a
// number embedded anywhere in the sentence for Duration/Travelers/Budget) rather than
// requiring the whole input to already be in the target shape.
//
// One rule from section 8 is explicitly AI-dependent and is NOT implemented here:
//   - Destination "is this a real place" check (section 8: "Claude API validates") — Step 7.
//
// Off-topic detection (section 8: "any field" — non-travel input rejected with the ✈️
// message) is implemented below as isLikelyOffTopic, rule-based per the Step 7 decision
// (no Claude call per keystroke). Found missing during Step 12 final QA — the bubble style
// existed (ChatBubble's "offtopic" role) but nothing ever triggered it. Wired into the two
// fields that actually had no content check before this (Name, Destination — "any text" /
// "letters only" both happily accept an unrelated question) and the amendment field, which
// is equally open-ended. Not layered onto duration/budget/travelers/groupType/theme: those
// already reject non-matching input via their own format/whitelist checks with a more
// specific, more useful message ("numbers only", "pick one of the options") than a generic
// off-topic bounce would give.
//
// Bilingual errors: every error message below is now picked from lib/chatCopy.ts via the
// `language` param each function takes, instead of a hardcoded English string — part of
// the Option A redesign (bot text respects the language toggle, read live per call).
// isLikelyOffTopic / OFF_TOPIC_MESSAGE / OFF_TOPIC_PATTERNS are UNCHANGED and stay
// English-only: ItineraryScreen.tsx still depends on them for its amendment-box check,
// which is out of scope for this redesign.

import type { GroupType, Language, TravelTheme } from "@/store/useTripStore";
import { chatCopy, t } from "@/lib/chatCopy";
import { matchTravelTheme } from "@/lib/fields";

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: string;
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
// Longest-first so "seventeen" matches whole rather than stopping at "seven".
const WORD_NUMBER_PATTERN = new RegExp(
  `\\b(${Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join("|")})\\b`,
);

/** Finds the first number anywhere in the input, as a digit run or a spelled-out word. */
function extractInteger(input: string): number | null {
  const lower = input.toLowerCase();
  const digitMatch = lower.match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);
  const wordMatch = lower.match(WORD_NUMBER_PATTERN);
  if (wordMatch) return WORD_NUMBERS[wordMatch[1]];
  return null;
}

const NAME_LEAD_INS = /^(my name is|i am|i'm|this is|call me|it'?s)\s+/i;
// Bug found in live testing: "This is Kaushik here." only had its leading "This is "
// stripped by NAME_LEAD_INS (which only ever strips known PREFIXES), leaving
// "Kaushik here" stored verbatim as the name. NAME_LEAD_INS has no concept of
// trailing filler at all, so this bounded list mirrors it for the common "X here" /
// "X speaking" shape — see the ordering note below for why it's applied where it is.
const NAME_TRAIL_OUTS = /\s+(here|speaking|only)[.!]*$/i;

export function validateName(input: string, language: Language): ValidationResult<string> {
  let stripped = input.trim().replace(NAME_LEAD_INS, "").replace(/[.!]+$/, "").trim();
  if (stripped.length < 2) {
    return { valid: false, error: t(chatCopy.errors.nameInvalid, language) };
  }
  // Letters + spaces only — rejects digits and travel-jargon shorthand like "7N/8D".
  if (!/^[a-zA-Z\s]+$/.test(stripped)) {
    return { valid: false, error: t(chatCopy.errors.nameInvalid, language) };
  }
  // Bug found in live testing: "This side Kaushik here" is ALL letters+spaces, so it
  // passed the check above as-is (NAME_LEAD_INS only strips a fixed list of known
  // phrasings, and "this side" wasn't one of them) — the full sentence got stored
  // verbatim as the name, and because this function reported valid:true, the
  // Claude-based fallback never even ran. A real name is essentially never more than
  // 3 words, so anything longer is far more likely to be an unstripped sentence than
  // a name — treat it as unresolved here instead of a false "valid". (This function
  // itself is now also called as the server-side safety net on Claude's own extracted
  // name in app/api/chat-turn/route.ts — same reasoning applies there: an
  // over-long "name" is rejected rather than trusted.)
  if (stripped.split(/\s+/).length > 3) {
    return { valid: false, error: t(chatCopy.errors.nameTooLong, language) };
  }
  // NAME_TRAIL_OUTS is deliberately applied AFTER the word-count check above, not
  // before: stripping trailing filler first would shrink the word count of an input
  // that still has an unrecognized, un-stripped LEADING phrase (like "this side",
  // which isn't in NAME_LEAD_INS) just enough to sneak it under the cap — e.g.
  // "This side Kaushik here" would shrink to "This side Kaushik" (3 words) and pass
  // as a false "valid" again, the exact bug the cap exists to catch. Running it after
  // means it only ever cleans up an input that was already short enough to trust.
  stripped = stripped.replace(NAME_TRAIL_OUTS, "").trim();
  if (stripped.length < 2) {
    return { valid: false, error: t(chatCopy.errors.nameInvalid, language) };
  }
  return { valid: true, value: stripped };
}

const DESTINATION_LEAD_INS =
  /^(i want to (go|travel) to|i'?d like to (go|travel) to|let'?s go to|i('m| am) planning (a trip )?to|planning (a trip )?to|destination is|going to|we want to go to)\s+/i;

export function validateDestination(input: string, language: Language): ValidationResult<string> {
  const stripped = input.trim().replace(DESTINATION_LEAD_INS, "").trim();
  if (stripped.length < 3) {
    return { valid: false, error: t(chatCopy.errors.destinationTooShort, language) };
  }
  // Anything outside plain ASCII (Hindi/Devanagari script, or English mixed with it,
  // e.g. "Thailand जाना है") can't be confidently normalized by a static rule the way
  // DESTINATION_LEAD_INS strips a known English prefix — treat it as unresolved here.
  // Claude-based extraction (lib/chatTurn.ts) normalizes it to a standard English
  // place name instead of this function storing it verbatim; this function then also
  // re-runs as the server-side safety net on whatever Claude returns.
  if (!/^[\x20-\x7E]+$/.test(stripped)) {
    return { valid: false, error: t(chatCopy.errors.destinationTooShort, language) };
  }
  // Same reasoning as validateName's word-count check: a real destination is rarely
  // more than 4 words, even multi-word ones ("Rio de Janeiro", "New York City") — an
  // ASCII sentence longer than that (e.g. "I really wanna visit Bali next year") is
  // far more likely to be unstripped phrasing DESTINATION_LEAD_INS didn't anticipate
  // than an actual destination name, so treat it as unresolved and let the Claude
  // fallback extract it instead of storing the sentence verbatim.
  if (stripped.split(/\s+/).length > 4) {
    return { valid: false, error: t(chatCopy.errors.destinationTooLong, language) };
  }
  // Real-place verification (Claude API) lands in Step 7 — every destination that
  // passes the checks above is accepted for now.
  return { valid: true, value: stripped };
}

export function validateDuration(input: string, language: Language): ValidationResult<number> {
  const n = extractInteger(input);
  if (n === null) {
    return { valid: false, error: t(chatCopy.errors.durationMissing, language) };
  }
  if (n < 1 || n > 10) {
    return { valid: false, error: t(chatCopy.errors.durationRange, language) };
  }
  return { valid: true, value: n };
}

export function validateTravelerCount(input: string, language: Language): ValidationResult<number> {
  const n = extractInteger(input);
  if (n === null) {
    return { valid: false, error: t(chatCopy.errors.travelersMissing, language) };
  }
  if (n < 1 || n > 50) {
    return { valid: false, error: t(chatCopy.errors.travelersRange, language) };
  }
  return { valid: true, value: n };
}

const GROUP_TYPES: GroupType[] = ["Family", "Couple", "Friends", "Solo"];

export function matchGroupType(input: string, language: Language): ValidationResult<GroupType> {
  const trimmed = input.trim().toLowerCase();
  const match = GROUP_TYPES.find((g) => g.toLowerCase() === trimmed || trimmed.includes(g.toLowerCase()));
  if (!match) {
    return { valid: false, error: t(chatCopy.errors.groupTypeChoice, language) };
  }
  return { valid: true, value: match };
}

// Added for the pure-conversational rebuild: ChatScreen used to match a theme chip's
// value directly against lib/constants.ts's TRAVEL_THEMES inline (chips are always an
// exact canonical value, so this was never a rejection path in practice) and, for a
// Claude-fallback theme answer, re-verified the same way. Now that any free-text
// message can name a theme, the unified /api/chat-turn endpoint needs this as a real
// bilingual-error safety-net validator, matching matchGroupType's shape exactly —
// matchTravelTheme (lib/fields.ts) does the actual lookup so the canonical theme list
// has one source of truth, shared with TripSummaryCard/ProgressBar's field-presence checks.
export function matchTheme(input: string, language: Language): ValidationResult<TravelTheme> {
  const match = matchTravelTheme(input);
  if (!match) {
    return { valid: false, error: t(chatCopy.errors.themeChoice, language) };
  }
  return { valid: true, value: match };
}

const LAKH = 100_000;
const MIN_BUDGET = 1_000;

/** Parses budget formats from section 8: "2 lakhs", "2L", "2,00,000", "200000", "two lakhs". */
export function parseBudget(input: string, language: Language): ValidationResult<number> {
  // Spaces kept here (only ₹ and thousands-separator commas stripped) so word
  // boundaries stay meaningful for the sentence-embedded fallback below.
  const cleaned = input.trim().toLowerCase().replace(/[₹,]/g, "");
  const stripped = cleaned.replace(/\s/g, "");

  // Exact formats from section 8 — bare "2 lakhs" / "2L" / "2,00,000" / "two lakhs".
  const digitLakhMatch = stripped.match(/^(\d+(?:\.\d+)?)(l|lakh|lakhs)$/);
  if (digitLakhMatch) {
    return finalizeBudget(Math.round(parseFloat(digitLakhMatch[1]) * LAKH), language);
  }
  const wordLakhMatch = stripped.match(/^([a-z]+)(lakh|lakhs)$/);
  if (wordLakhMatch && wordLakhMatch[1] in WORD_NUMBERS) {
    return finalizeBudget(WORD_NUMBERS[wordLakhMatch[1]] * LAKH, language);
  }
  if (/^\d+$/.test(stripped)) {
    return finalizeBudget(parseInt(stripped, 10), language);
  }

  // Fallback: the same shapes, but embedded in a full sentence ("my budget is
  // around 2 lakhs") rather than the bare number section 8's examples show.
  const embeddedDigitLakh = cleaned.match(/(\d+(?:\.\d+)?)\s*(lakhs?|l)\b/);
  if (embeddedDigitLakh) {
    return finalizeBudget(Math.round(parseFloat(embeddedDigitLakh[1]) * LAKH), language);
  }
  const embeddedWordLakh = cleaned.match(new RegExp(`\\b(${Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join("|")})\\s*(lakhs?)\\b`));
  if (embeddedWordLakh) {
    return finalizeBudget(WORD_NUMBERS[embeddedWordLakh[1]] * LAKH, language);
  }
  // A plain digit run of at least 3 digits inside a sentence — budgets are never
  // below the ₹1,000 minimum, so a duration or traveler count mentioned in the
  // same breath (single or double digits) won't be mistaken for one.
  const embeddedDigits = cleaned.match(/\d{3,}/);
  if (embeddedDigits) {
    return finalizeBudget(parseInt(embeddedDigits[0], 10), language);
  }

  return { valid: false, error: t(chatCopy.errors.budgetInvalid, language) };
}

function finalizeBudget(amount: number, language: Language): ValidationResult<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: t(chatCopy.errors.budgetInvalid, language) };
  }
  if (amount < MIN_BUDGET) {
    return { valid: false, error: t(chatCopy.errors.budgetMin(formatINR(MIN_BUDGET)), language) };
  }
  return { valid: true, value: amount };
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// Verbatim from section 8's validation table.
export const OFF_TOPIC_MESSAGE = "✈️ I'm Tripoly's Itinerary Planner. I can only help you plan your perfect trip!";

const OFF_TOPIC_PATTERNS: RegExp[] = [
  // "who/what/when/why/how is/are/do/does/can/will..." — a real answer to a chat-flow
  // question is never itself phrased as a question back.
  /^(who|what|when|why|how)\s+(is|are|was|were|do|does|did|can|will|would)\b/,
  /\b(joke|riddle|weather today|capital of|president|prime minister|stock price|meaning of life)\b/,
  /\b(write (me )?(a|an) (poem|essay|code|story|song)|solve this|calculate|translate this)\b/,
  /^(hi|hello|hey|yo)[.! ]*$/,
];

/**
 * Rule-based off-topic detector (Step 7 decision: no Claude call per keystroke).
 * `allowQuestion` skips the trailing-"?" rule — the amendment field legitimately gets
 * phrased as a question ("can we add a beach day?"), unlike Name/Destination.
 */
export function isLikelyOffTopic(input: string, opts: { allowQuestion?: boolean } = {}): boolean {
  const trimmed = input.trim();
  // Too short to confidently classify either way — let the field's own validator handle it.
  if (trimmed.length < 4) return false;
  if (!opts.allowQuestion && /\?\s*$/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return OFF_TOPIC_PATTERNS.some((re) => re.test(lower));
}
