// Sarvam AI text-to-speech. See TRIPOLY_HANDOFF.md section 10.
//
// GET added for the pure-conversational rebuild's voice-latency fix: a native
// <audio src="/api/tts?..."> element (ChatScreen.tsx's speak()) needs a GET, URL-based
// request to stream progressively — POST/fetch/JSON can't be the target of an <audio>
// element's src. Proxies lib/sarvam.ts's streaming endpoint straight through without
// buffering: the response body is Sarvam's own ReadableStream, piped through
// unconsumed, so playback can start as soon as the first bytes arrive instead of
// waiting for the whole clip.
//
// The original POST handler below is left completely unchanged and still returns the
// full base64 clip — components/screens/ItineraryScreen.tsx's own speak() (amendment
// voice replies) still calls it exactly as before. That screen wasn't part of what you
// reported the 5s gap on, and switching it too wasn't asked for, so it's untouched —
// happy to bring it onto the same streaming path in a follow-up if you'd like.
import { NextRequest, NextResponse } from "next/server";
import { ttsSynthesize, ttsSynthesizeStream } from "@/lib/sarvam";
import type { Language } from "@/store/useTripStore";

// Always dynamic: this depends on the request's own query params and calls out to
// Sarvam on every request — never a candidate for static/cached prerendering.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") ?? "").trim();
  const language: Language = req.nextUrl.searchParams.get("language") === "HI" ? "HI" : "EN";

  if (!text) {
    return NextResponse.json({ error: "no_text" }, { status: 400 });
  }

  try {
    const sarvamRes = await ttsSynthesizeStream(text, language);
    return new Response(sarvamRes.body, {
      headers: {
        "Content-Type": sarvamRes.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/tts GET]", err);
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}

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
