// Unified per-turn chat endpoint — replaces app/api/extract-field/route.ts. Called on
// every free-text chat turn (not on a quick-chip tap, which stays fully local/free —
// see components/screens/ChatScreen.tsx). Mirrors the error-handling shape of the
// route it replaces and of app/api/stt/route.ts.
//
// Safety net (confirmed with you as part of the pure-conversational rebuild): Claude's
// own sense of what it extracted is never trusted directly. Every field in its
// `updates` is re-run here through the exact same lib/validators.ts bounds checks used
// everywhere else in the app before it's handed back to the client — a field that
// fails validation is dropped from `updates` and its specific bilingual chatCopy error
// message is surfaced via `invalidMessages` instead, exactly like a mechanical local
// rejection always has been (never silently dropped, and never disguised as Claude's
// own conversational reply).
import { NextRequest, NextResponse } from "next/server";
import { chatTurn } from "@/lib/chatTurn";
import { FIELD_PRIORITY, type FieldKey } from "@/lib/fields";
import {
  matchGroupType,
  matchTheme,
  parseBudget,
  validateDestination,
  validateDuration,
  validateName,
  validateTravelerCount,
  type ValidationResult,
} from "@/lib/validators";
import type { Language } from "@/store/useTripStore";

function validateField(field: FieldKey, rawValue: string | number, language: Language): ValidationResult<string | number> {
  const raw = String(rawValue);
  switch (field) {
    case "name":
      return validateName(raw, language);
    case "destination":
      return validateDestination(raw, language);
    case "duration":
      return validateDuration(raw, language);
    case "budget":
      return parseBudget(raw, language);
    case "travelerCount":
      return validateTravelerCount(raw, language);
    case "groupType":
      return matchGroupType(raw, language);
    case "theme":
      return matchTheme(raw, language);
  }
}

export async function POST(req: NextRequest) {
  let body: { message?: unknown; language?: unknown; collected?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const language: Language = body.language === "HI" ? "HI" : "EN";

  if (!message) {
    return NextResponse.json({ error: "no_input" }, { status: 400 });
  }

  // Only pass through keys that are actually one of the 7 known fields, with a
  // string/number value — anything else in the client's payload is ignored rather
  // than forwarded into the prompt verbatim.
  const collectedRaw = (body.collected && typeof body.collected === "object" ? body.collected : {}) as Record<string, unknown>;
  const collected: Partial<Record<FieldKey, string | number>> = {};
  for (const field of FIELD_PRIORITY) {
    const v = collectedRaw[field];
    if (typeof v === "string" || typeof v === "number") {
      collected[field] = v;
    }
  }

  try {
    const result = await chatTurn(message, language, collected);

    const updates: Partial<Record<FieldKey, string | number>> = {};
    const invalidMessages: string[] = [];

    for (const [key, value] of Object.entries(result.updates)) {
      if (!FIELD_PRIORITY.includes(key as FieldKey)) continue;
      if (value === undefined || value === null || value === "") continue;

      const field = key as FieldKey;
      const r = validateField(field, value, language);
      if (r.valid) {
        updates[field] = r.value as string | number;
      } else if (r.error) {
        invalidMessages.push(r.error);
      }
    }

    return NextResponse.json({ updates, invalidMessages, reply: result.reply });
  } catch (err) {
    console.error("[api/chat-turn]", err);
    return NextResponse.json({ error: "chat_turn_failed" }, { status: 502 });
  }
}
