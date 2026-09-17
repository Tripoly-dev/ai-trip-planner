"use client";

// Chat screen — "live trip summary card" that updates as the user answers, per
// TRIPOLY_HANDOFF.md section 13. Self-contained (reads the store directly) so it drops
// in without prop drilling and without touching ChatScreen's conversation/mic logic.
//
// Pure-conversational rebuild: row-building logic moved to lib/fields.ts's
// buildSummaryRows (one source of truth, also used by ChatScreen's inline mobile recap
// — see that file). Also gained an optional onConfirm: once every field is present
// (the same deterministic completion gate ChatScreen/ProgressBar use, via
// lib/fields.ts's isTripComplete), this becomes the recap + explicit confirm step
// agreed as part of the rebuild — Trip Generation no longer auto-triggers the instant
// the last field is set, the user now has to actively confirm.

import { useTripStore } from "@/store/useTripStore";
import { buildSummaryRows, isTripComplete } from "@/lib/fields";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-tripoly-border py-3 last:border-b-0">
      <span className="font-sans text-[13px] text-tripoly-text-muted">{label}</span>
      <span className="font-sans text-sm font-semibold text-tripoly-text">{value}</span>
    </div>
  );
}

export interface TripSummaryCardProps {
  /** When provided and every field is present, renders a "Generate My Trip" button. */
  onConfirm?: () => void;
}

export function TripSummaryCard({ onConfirm }: TripSummaryCardProps = {}) {
  const name = useTripStore((s) => s.name);
  const destination = useTripStore((s) => s.destination);
  const duration = useTripStore((s) => s.duration);
  const travelDate = useTripStore((s) => s.travelDate);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const perPersonBudget = useTripStore((s) => s.perPersonBudget);
  const travelerCount = useTripStore((s) => s.travelerCount);
  const groupType = useTripStore((s) => s.groupType);
  const travelTheme = useTripStore((s) => s.travelTheme);

  const snapshot = { name, destination, duration, travelDate, totalBudget, perPersonBudget, travelerCount, groupType, travelTheme };
  const rows = buildSummaryRows(snapshot);
  const complete = isTripComplete(snapshot);

  return (
    <div className="rounded-2xl border border-tripoly-border bg-white p-5 shadow-tripoly-card">
      <div className="mb-1 font-serif text-lg font-bold text-black">Your Trip</div>
      {rows.length === 0 ? (
        <p className="mt-3 font-sans text-sm text-tripoly-text-muted">
          Answer a few questions and we&apos;ll build your trip summary here as you go.
        </p>
      ) : (
        <div className="mt-2">
          {rows.map((r) => (
            <SummaryRow key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      )}

      {complete && onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-4 flex h-[46px] w-full items-center justify-center rounded-full bg-tripoly-green font-sans text-sm font-semibold text-white"
        >
          Generate My Trip →
        </button>
      )}
    </div>
  );
}
