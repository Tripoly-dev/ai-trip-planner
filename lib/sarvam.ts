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
//
// ttsSynthesizeStream added for the pure-conversational rebuild's voice-latency fix:
// ttsSynthesize (batch) above waits for Sarvam to render the ENTIRE clip before
// returning anything, which is the ~5s gap you reported before voice mode starts
// speaking. Verified against Sarvam's current REST API reference (docs.sarvam.ai/
// api-reference/text-to-speech/convert-stream) before implementing, since this is a
// different endpoint with different field names, not just a flag on the same one:
//   - POST https://api.sarvam.ai/text-to-speech/stream (batch is .../text-to-speech,
//     no /stream suffix).
//   - Body field is language_code here, NOT target_language_code — the batch
//     endpoint's field name doesn't carry over; verified directly against Sarvam's
//     docs rather than assumed from the batch shape.
//   - Auth header is the same api-subscription-key already used everywhere else in
//     this file (confirmed against Sarvam's REST API reference, not the informal
//     guide page, which showed a Bearer-token example inconsistent with the rest of
//     this working integration).
//   - Response is a raw binary audio stream (not JSON/base64) — output_audio_codec
//     "mp3" requested explicitly (rather than relying on the default) because MP3
//     doesn't need to know its total length up front, unlike WAV, which is what
//     lets the browser's <audio> element start playback before the stream finishes.
//   - Sarvam's own documented hard cap is 3500 characters per request; defensively
//     truncated to that limit here (not a new app-level constraint, just respecting
//     the external API's stated maximum instead of letting a long reply 400).

import type { Language } from "@/store/useTripStore";

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const SARVAM_TTS_STREAM_URL = "https://api.sarvam.ai/text-to-speech/stream";
const SARVAM_TTS_MAX_CHARS = 3500;

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
  // Chrome's MediaRecorder reports mimeType as "audio/webm;codecs=opus" by default.
  // Sarvam's allowed-type check is an exact string match and only lists bare
  // "audio/webm" (no codec suffix) — the codec param alone causes a 400 on every
  // request, even though the underlying bytes are a type Sarvam accepts fine.
  // Strip it before sending; the audio content itself is unchanged.
  const cleanType = audio.type.split(";")[0] || "audio/webm";
  const cleanAudio = new Blob([await audio.arrayBuffer()], { type: cleanType });

  const form = new FormData();
  form.append("file", cleanAudio, "recording.webm");
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

/**
 * Starts a streaming speech synthesis and returns the raw, unconsumed fetch Response —
 * the caller (app/api/tts/route.ts's GET handler) pipes `res.body` straight through to
 * its own Response so audio starts reaching the browser as Sarvam produces it, instead
 * of waiting for the full clip like ttsSynthesize above. Throws on a non-2xx response
 * (after reading it as text for the error message); on success, the body is
 * deliberately left unread so the caller can stream it.
 */
export async function ttsSynthesizeStream(text: string, language: Language): Promise<Response> {
  const res = await fetch(SARVAM_TTS_STREAM_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text.slice(0, SARVAM_TTS_MAX_CHARS),
      language_code: toSarvamLanguageCode(language),
      output_audio_codec: "mp3",
    }),
  });

  if (!res.ok) {
    throw new Error(`Sarvam streaming TTS failed (${res.status}): ${await res.text()}`);
  }

  return res;
}
