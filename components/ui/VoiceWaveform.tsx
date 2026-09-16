"use client";

// Live, voice-reactive waveform shown in ChatScreen's input area while recording.
// Originally rendered inside the mic button itself (small, white bars on the green
// button); moved into the input pill as part of the Option A mic redesign so the
// input area itself shows "I'm listening" instead of a tiny icon-sized hint — more
// bars, taller, and colored to read clearly against the input pill's light
// background instead of the green button it used to sit on.
//
// Reads real amplitude via the Web Audio API (AnalyserNode on the same MediaStream
// getUserMedia already opened) rather than faking motion, and drives bar heights
// directly through refs in a requestAnimationFrame loop — NOT React state — since a
// state update per frame (~60/sec) would re-render the whole chat screen continuously
// while recording.

import { useEffect, useRef } from "react";

const BAR_COUNT = 20;

export function VoiceWaveform({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !stream) return;

    type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AudioContextCtor) return; // no Web Audio support — button still works, just no waveform

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    // Bumped from 64 (16 usable bins) to 128 (32 usable bins) now that there are 20
    // bars instead of 5 — keeps a few real frequency bins averaged per bar instead
    // of most bars reading the same one or two bins.
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const bucketSize = Math.max(1, Math.floor(data.length / BAR_COUNT));

    function tick() {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) sum += data[i * bucketSize + j] ?? 0;
        const avg = sum / bucketSize; // 0-255
        const scale = 0.3 + (avg / 255) * 1.4; // small idle bar + real amplitude on top
        const bar = barRefs.current[i];
        if (bar) bar.style.transform = `scaleY(${scale.toFixed(2)})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [active, stream]);

  if (!active) return null;

  return (
    <div className="flex h-[24px] w-full items-center justify-between gap-[2px]" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="h-full max-w-[3px] flex-1 origin-center rounded-full bg-tripoly-error"
          style={{ transform: "scaleY(0.25)" }}
        />
      ))}
    </div>
  );
}
