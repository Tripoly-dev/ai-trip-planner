// Shared field metadata for the pure-conversational chat flow — the single source of
// truth for "which 7 fields are we collecting, in what priority order, and how do we
// know when the trip is complete." Framework-agnostic and secret-free by design so
// both the client (ChatScreen, ProgressBar, TripSummaryCard) and the server
// (app/api/chat-turn/route.ts) import it — unlike lib/chatTurn.ts (the Claude call
// itself), this file never touches ANTHROPIC_API_KEY.
//
// Supersedes the old ChatStep/currentStep/setStep machine in store/useTripStore.ts:
// instead of a fixed 1-6 step number driving what's askable next, "what's still
// needed" is now always computed live from which fields are actually present in the
// store — the deterministic completion gate this was built for. See
// TRIPOLY_HANDOFF.md-derived history in ChatScreen.tsx's file header for why the
// step machine was replaced.

import type { GroupType, Language, TravelTheme } from "@/store/useTripStore";
import { TRAVEL_THEMES } from "@/lib/constants";

export type FieldKey =
  | "name"
  | "destination"
  | "duration"
  | "budget"
  | "travelerCount"
  | "groupType"
  | "theme";

// Priority order used two ways: (1) as the UX nudge — which quick chips/hint to show
// next, and which single field Claude is told to naturally ask for next — never as a
// hard gate on what the user is allowed to say; (2) as the deterministic tie-break for
// "what's still missing," so out-of-order answers (e.g. budget given before duration)
// are recognized correctly instead of assuming a fixed sequence was followed.
export const FIELD_PRIORITY: FieldKey[] = [
  "name",
  "destination",
  "duration",
  "budget",
  "travelerCount",
  "groupType",
  "theme",
];

/** Maps a FieldKey (the API/prompt vocabulary) to the store field it corresponds to. */
export const FIELD_TO_STORE_KEY: Record<FieldKey, string> = {
  name: "name",
  destination: "destination",
  duration: "duration",
  budget: "totalBudget",
  travelerCount: "travelerCount",
  groupType: "groupType",
  theme: "travelTheme",
};

/** The 7 collected fields, in store shape — used for the completion gate and chip visibility. */
export interface FieldPresenceSnapshot {
  name: string;
  destination: string;
  duration: number;
  totalBudget: number;
  travelerCount: number;
  groupType: GroupType | null;
  travelTheme: TravelTheme | null;
}

/** Adds perPersonBudget — needed by the recap/summary rows but not by the completion gate. */
export interface TripFieldsSnapshot extends FieldPresenceSnapshot {
  perPersonBudget: number;
}

function isFieldPresent(snapshot: FieldPresenceSnapshot, field: FieldKey): boolean {
  switch (field) {
    case "name":
      return snapshot.name.trim().length > 0;
    case "destination":
      return snapshot.destination.trim().length > 0;
    case "duration":
      return snapshot.duration > 0;
    case "budget":
      return snapshot.totalBudget > 0;
    case "travelerCount":
      return snapshot.travelerCount > 0;
    case "groupType":
      return snapshot.groupType !== null;
    case "theme":
      return snapshot.travelTheme !== null;
  }
}

/**
 * The deterministic completion gate: the first still-missing field in priority order,
 * or null once all 7 are present. This — never the model's own sense of "I think I have
 * everything" — is the sole authority for whether Trip Generation is allowed to unlock.
 */
export function nextMissingField(snapshot: FieldPresenceSnapshot): FieldKey | null {
  for (const field of FIELD_PRIORITY) {
    if (!isFieldPresent(snapshot, field)) return field;
  }
  return null;
}

export function isTripComplete(snapshot: FieldPresenceSnapshot): boolean {
  return nextMissingField(snapshot) === null;
}

/** Matches free-form text to one of the 5 canonical travel themes — mirrors matchGroupType's shape. */
export function matchTravelTheme(input: string): TravelTheme | null {
  const trimmed = input.trim().toLowerCase();
  const match = TRAVEL_THEMES.find((opt) => opt.theme.toLowerCase() === trimmed);
  return match ? match.theme : null;
}

export interface SummaryRow {
  label: string;
  value: string;
}

/**
 * Builds the recap rows shown once fields are collected — one source of truth reused by
 * both TripSummaryCard (desktop, always-visible) and ChatScreen's inline mobile recap
 * (shown once the trip is complete, alongside the explicit confirm button). Row content/
 * order matches TripSummaryCard's original English-only labels exactly — no visual change,
 * just a shared implementation instead of a component-local one.
 */
export function buildSummaryRows(snapshot: TripFieldsSnapshot): SummaryRow[] {
  const rows: SummaryRow[] = [];
  if (snapshot.name) rows.push({ label: "Name", value: snapshot.name });
  if (snapshot.destination) rows.push({ label: "Destination", value: snapshot.destination });
  if (snapshot.duration > 0) {
    rows.push({ label: "Duration", value: `${snapshot.duration} Night${snapshot.duration === 1 ? "" : "s"}` });
  }
  if (snapshot.totalBudget > 0) {
    rows.push({ label: "Total Budget", value: `₹${snapshot.totalBudget.toLocaleString("en-IN")}` });
  }
  if (snapshot.travelerCount > 0) rows.push({ label: "Travelers", value: String(snapshot.travelerCount) });
  if (snapshot.groupType) rows.push({ label: "Group", value: snapshot.groupType });
  if (snapshot.perPersonBudget > 0 && snapshot.travelerCount > 0) {
    rows.push({ label: "Per Person", value: `₹${snapshot.perPersonBudget.toLocaleString("en-IN")}` });
  }
  if (snapshot.travelTheme) rows.push({ label: "Theme", value: snapshot.travelTheme });
  return rows;
}

// Re-exported so callers that only need the language type alongside FieldKey don't need
// a second import from the store module.
export type { Language };
