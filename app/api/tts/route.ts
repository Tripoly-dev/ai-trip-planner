// Sarvam AI text-to-speech. See TRIPOLY_HANDOFF.md section 10.
import { NextRequest, NextResponse } from "next/server";
import { ttsSynthesize } from "@/lib/sarvam";
import type { Language } from "@/store/useTripStore";

export async function POST(req: NextRequest) {
  let body: { text?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const language: Language = body.language === "HI" ? "HI" : "EN";

  if (!text) {
    return NextResponse.json({ error: "no_text" }, { status: 400 });
  }

  try {
    const audioBase64 = await ttsSynthesize(text, language);
    return NextResponse.json({ audioBase64 });
  } catch (err) {
    console.error("[api/tts]", err);
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}
