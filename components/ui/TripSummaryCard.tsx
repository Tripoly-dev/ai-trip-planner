"use client";

// Chat screen, desktop only (lg: 1024px+) — right-column "live trip summary card" that
// updates as the user answers, per TRIPOLY_HANDOFF.md section 13. No mobile chat markup or
// mockup reference exists for this — it's new content, confirmed with you before building:
// each row appears once that field is actually confirmed in the store, not just typed.
// Self-contained (reads the store directly) so it drops into ChatScreen without prop drilling
// and without touching any of ChatScreen's existing conversation/mic logic.

import { useTripStore } from "@/store/useTripStore";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-tripoly-border py-3 last:border-b-0">
      <span className="font-sans text-[13px] text-tripoly-text-muted">{label}</span>
      <span className="font-sans text-sm font-semibold text-tripoly-text">{value}</span>
    </div>
  );
}

export function TripSummaryCard() {
  const name = useTripStore((s) => s.name);
  const destination = useTripStore((s) => s.destination);
  const duration = useTripStore((s) => s.duration);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const perPersonBudget = useTripStore((s) => s.perPersonBudget);
  const travelerCount = useTripStore((s) => s.travelerCount);
  const groupType = useTripStore((s) => s.groupType);
  const travelTheme = useTripStore((s) => s.travelTheme);

  const rows: { label: string; value: string }[] = [];
  if (name) rows.push({ label: "Name", value: name });
  if (destination) rows.push({ label: "Destination", value: destination });
  if (duration > 0) rows.push({ label: "Duration", value: `${duration} Night${duration === 1 ? "" : "s"}` });
  if (totalBudget > 0) rows.push({ label: "Total Budget", value: `₹${totalBudget.toLocaleString("en-IN")}` });
  if (travelerCount > 0) rows.push({ label: "Travelers", value: String(travelerCount) });
  if (groupType) rows.push({ label: "Group", value: groupType });
  if (perPersonBudget > 0 && travelerCount > 0) {
    rows.push({ label: "Per Person", value: `₹${perPersonBudget.toLocaleString("en-IN")}` });
  }
  if (travelTheme) rows.push({ label: "Theme", value: travelTheme });

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
    </div>
  );
}
