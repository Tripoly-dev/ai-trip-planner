// Sarvam AI speech-to-text. See TRIPOLY_HANDOFF.md section 10.
import { NextRequest, NextResponse } from "next/server";
import { sttTranscribe } from "@/lib/sarvam";
import type { Language } from "@/store/useTripStore";

// Known issue (handoff section 16): Sarvam STT returns garbage on silence —
// validate transcript length before treating it as real input.
const MIN_TRANSCRIPT_LENGTH = 2;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const audio = form.get("audio");
  const language = (form.get("language") as Language | null) ?? "EN";

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "no_audio" }, { status: 400 });
  }

  try {
    const { transcript } = await sttTranscribe(audio, language);
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      return NextResponse.json({ error: "silence" }, { status: 422 });
    }
    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[api/stt]", err);
    return NextResponse.json({ error: "stt_failed" }, { status: 502 });
  }
}
