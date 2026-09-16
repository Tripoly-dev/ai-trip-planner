// Claude-based fallback field extraction. Called only when the local regex-based
// parsing in lib/validators.ts fails on a chat-flow answer — see lib/fieldExtraction.ts
// for why. Mirrors the error-handling shape of app/api/stt/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { extractField, type FieldKey } from "@/lib/fieldExtraction";
import type { Language } from "@/store/useTripStore";

const VALID_FIELDS: FieldKey[] = [
  "name",
  "destination",
  "duration",
  "budget",
  "travelerCount",
  "groupType",
  "theme",
  "confirm",
];

export async function POST(req: NextRequest) {
  let body: { field?: string; rawInput?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { field, rawInput, language } = body;

  if (!field || !VALID_FIELDS.includes(field as FieldKey)) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400 });
  }
  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return NextResponse.json({ error: "no_input" }, { status: 400 });
  }

  try {
    const result = await extractField(
      field as FieldKey,
      rawInput,
      (language === "HI" ? "HI" : "EN") as Language,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/extract-field]", err);
    return NextResponse.json({ error: "extraction_failed" }, { status: 502 });
  }
}
