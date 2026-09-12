// Sarvam AI STT/TTS helper functions — server-only. Called exclusively from
// app/api/stt/route.ts and app/api/tts/route.ts, which is where SARVAM_API_KEY
// is read; never exposed to the client.
//
// TRIPOLY_HANDOFF.md section 10 names STT model "saarika:v2.5" and a TTS body
// shape of { text, language_code, speaker }. Verified against Sarvam's current
// API docs (docs.sarvam.ai) before implementing:
//   - saarika:v2.5 is now flagged deprecated in Sarvam's own docs, in favor of
//     the "saaras" model family (same /speech-to-text endpoint, mode: "transcribe"
//     for plain in-language transcription — not translation). Using saaras:v3
//     (Sarvam's current default) here instead of the deprecated model.
//   - The TTS request field is target_language_code, not language_code.
// Both are drop-in equivalents for what the spec describes (transcribe audio in
// the spoken language; synthesize speech in a given language) — the model name
// and one field name are the only deltas from the literal spec text.

import type { Language } from "@/store/useTripStore";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

function apiKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    throw new Error("SARVAM_API_KEY is not configured");
  }
  return key;
}

function toSarvamLanguageCode(language: Language): "en-IN" | "hi-IN" {
  return language === "HI" ? "hi-IN" : "en-IN";
}

export interface SttResult {
  transcript: string;
}

/** Transcribes an audio clip in the language it was spoken. Throws on API/network failure. */
export async function sttTranscribe(audio: Blob, language: Language): Promise<SttResult> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  form.append("model", "saaras:v3");
  form.append("mode", "transcribe");
  form.append("language_code", toSarvamLanguageCode(language));

  const res = await fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": apiKey() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Sarvam STT failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return { transcript: typeof data.transcript === "string" ? data.transcript.trim() : "" };
}

/** Synthesizes speech for the given text. Returns base64-encoded audio (WAV). Throws on failure. */
export async function ttsSynthesize(text: string, language: Language): Promise<string> {
  const res = await fetch(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      target_language_code: toSarvamLanguageCode(language),
    }),
  });

  if (!res.ok) {
    throw new Error(`Sarvam TTS failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const audioBase64 = Array.isArray(data.audios) ? data.audios[0] : undefined;
  if (!audioBase64) {
    throw new Error("Sarvam TTS returned no audio");
  }
  return audioBase64;
}
