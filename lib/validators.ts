// All input validation + parsing for the 6-step chat flow.
// Per TRIPOLY_HANDOFF.md section 8. Applies identically to typed and voice-transcribed
// text (voice arrives as text once Step 6 wires Sarvam STT, so these functions don't
// need to know which source it came from).
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

import type { GroupType } from "@/store/useTripStore";

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: string;
}

export function validateName(input: string): ValidationResult<string> {
  const trimmed = input.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: "Please enter a valid name (letters only)." };
  }
  // Letters + spaces only — rejects digits and travel-jargon shorthand like "7N/8D".
  if (!/^[a-zA-Z\s]+$/.test(trimmed)) {
    return { valid: false, error: "Please enter a valid name (letters only)." };
  }
  return { valid: true, value: trimmed };
}

export function validateDestination(input: string): ValidationResult<string> {
  const trimmed = input.trim();
  if (trimmed.length < 3) {
    return { valid: false, error: "Please enter at least 3 characters." };
  }
  // Real-place verification (Claude API) lands in Step 7 — every destination that
  // passes the length check is accepted for now.
  return { valid: true, value: trimmed };
}

export function validateDuration(input: string): ValidationResult<number> {
  const trimmed = input.trim();
  // Numbers only — "No text like 'one week'" per spec, so word-numbers are rejected here
  // (unlike budget, which explicitly does accept them).
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: "Numbers only, please (max 10 days)." };
  }
  const n = parseInt(trimmed, 10);
  if (n < 1 || n > 10) {
    return { valid: false, error: "Please enter between 1 and 10 days." };
  }
  return { valid: true, value: n };
}

export function validateTravelerCount(input: string): ValidationResult<number> {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: "Numbers only, please." };
  }
  const n = parseInt(trimmed, 10);
  if (n < 1 || n > 50) {
    return { valid: false, error: "Please enter between 1 and 50 travelers." };
  }
  return { valid: true, value: n };
}

const GROUP_TYPES: GroupType[] = ["Family", "Couple", "Friends", "Solo"];

export function matchGroupType(input: string): ValidationResult<GroupType> {
  const trimmed = input.trim().toLowerCase();
  const match = GROUP_TYPES.find((g) => g.toLowerCase() === trimmed || trimmed.includes(g.toLowerCase()));
  if (!match) {
    return { valid: false, error: "Please choose one: Family, Couple, Friends, or Solo." };
  }
  return { valid: true, value: match };
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

const LAKH = 100_000;
const MIN_BUDGET = 1_000;

/** Parses budget formats from section 8: "2 lakhs", "2L", "2,00,000", "200000", "two lakhs". */
export function parseBudget(input: string): ValidationResult<number> {
  const trimmed = input.trim().toLowerCase().replace(/[₹,\s]/g, "");

  // "2l" / "2lakh" / "2lakhs" — digit + lakh suffix.
  const digitLakhMatch = trimmed.match(/^(\d+(?:\.\d+)?)(l|lakh|lakhs)$/);
  if (digitLakhMatch) {
    const amount = Math.round(parseFloat(digitLakhMatch[1]) * LAKH);
    return finalizeBudget(amount);
  }

  // "twolakh" / "twolakhs" (already stripped spaces above) — word-number + lakh suffix.
  const wordLakhMatch = trimmed.match(/^([a-z]+)(lakh|lakhs)$/);
  if (wordLakhMatch && wordLakhMatch[1] in WORD_NUMBERS) {
    const amount = WORD_NUMBERS[wordLakhMatch[1]] * LAKH;
    return finalizeBudget(amount);
  }

  // Plain digits (commas already stripped): "200000".
  if (/^\d+$/.test(trimmed)) {
    return finalizeBudget(parseInt(trimmed, 10));
  }

  return { valid: false, error: "Please enter a valid budget (e.g. ₹2 lakhs, 2L, or ₹2,00,000)." };
}

function finalizeBudget(amount: number): ValidationResult<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: "Please enter a valid budget (e.g. ₹2 lakhs, 2L, or ₹2,00,000)." };
  }
  if (amount < MIN_BUDGET) {
    return { valid: false, error: `Minimum budget is ₹${MIN_BUDGET.toLocaleString("en-IN")}.` };
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
