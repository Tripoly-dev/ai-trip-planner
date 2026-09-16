"use client";

// Live, voice-reactive waveform shown on the mic button while recording (ChatScreen,
// ItineraryScreen amendment mic). Replaces a static CSS pulse animation — built after
// live testing feedback that the old feedback (a generic pulsing circle, same
// regardless of whether you were speaking or silent) didn't read as "listening."
//
// Reads real amplitude via the Web Audio API (AnalyserNode on the same MediaStream
// getUserMedia already opened) rather than faking motion, and drives bar heights
// directly through refs in a requestAnimationFrame loop — NOT React state — since a
// state update per frame (~60/sec) would re-render the whole chat screen continuously
// while recording.

import { useEffect, useRef } from "react";

const BAR_COUNT = 5;

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
    analyser.fftSize = 64;
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
    <div className="flex h-[18px] items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="h-full w-[3px] flex-shrink-0 origin-center rounded-full bg-white"
          style={{ transform: "scaleY(0.3)" }}
        />
      ))}
    </div>
  );
}
