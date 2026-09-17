"use client";

// Screen 3 header — 7-bucket chat progress bar (added "Dates" alongside the original
// 6 buckets when travel-date collection was introduced). Per TRIPOLY_HANDOFF.md section 7:
// Active step = filled dot, Completed = green tick, Pending = grey dot.
//
// Pure-conversational rebuild: no more `currentStep` prop. The store dropped
// ChatStep/currentStep entirely (fields can now be answered in any order), so this
// reads the store directly (like TripSummaryCard already did) and derives progress
// from field PRESENCE via lib/fields.ts's nextMissingField() — the same deterministic
// completion-gate logic ChatScreen and TripSummaryCard use. Visual output (6 labels,
// tick/dot/line styling) is unchanged from the original design; only where "which step
// are we on" comes from has changed. "Travelers" stays one visual bucket covering both
// underlying fields (travelerCount + groupType), matching the original step 5's two
// sub-steps under one label.

import { useTripStore } from "@/store/useTripStore";
import { nextMissingField, type FieldKey } from "@/lib/fields";

interface Bucket {
  label: string;
  fields: FieldKey[];
}

const BUCKETS: Bucket[] = [
  { label: "Name", fields: ["name"] },
  { label: "Destination", fields: ["destination"] },
  { label: "Duration", fields: ["duration"] },
  { label: "Dates", fields: ["travelDate"] },
  { label: "Budget", fields: ["budget"] },
  { label: "Travelers", fields: ["travelerCount", "groupType"] },
  { label: "Vibe", fields: ["theme"] },
];

export function ProgressBar() {
  const name = useTripStore((s) => s.name);
  const destination = useTripStore((s) => s.destination);
  const duration = useTripStore((s) => s.duration);
  const travelDate = useTripStore((s) => s.travelDate);
  const totalBudget = useTripStore((s) => s.totalBudget);
  const travelerCount = useTripStore((s) => s.travelerCount);
  const groupType = useTripStore((s) => s.groupType);
  const travelTheme = useTripStore((s) => s.travelTheme);

  const snapshot = { name, destination, duration, travelDate, totalBudget, travelerCount, groupType, travelTheme };
  const missing = nextMissingField(snapshot);

  const isFieldDone = (field: FieldKey): boolean => {
    switch (field) {
      case "name":
        return name.trim().length > 0;
      case "destination":
        return destination.trim().length > 0;
      case "duration":
        return duration > 0;
      case "travelDate":
        return travelDate.trim().length > 0;
      case "budget":
        return totalBudget > 0;
      case "travelerCount":
        return travelerCount > 0;
      case "groupType":
        return groupType !== null;
      case "theme":
        return travelTheme !== null;
    }
  };

  return (
    <div className="flex items-center gap-1">
      {BUCKETS.map((bucket, i) => {
        const isCompleted = bucket.fields.every(isFieldDone);
        const isActive = !isCompleted && missing !== null && bucket.fields.includes(missing);

        return (
          <div key={bucket.label} className="contents">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={[
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-sans transition-colors duration-200",
                  isCompleted || isActive
                    ? "bg-tripoly-green text-white"
                    : "bg-white border border-tripoly-border text-tripoly-text-muted",
                ].join(" ")}
              >
                {isCompleted ? "✓" : ""}
              </div>
              <div
                className={[
                  "font-sans text-[9px] font-medium transition-colors duration-200",
                  isCompleted || isActive ? "text-tripoly-text" : "text-tripoly-text-muted",
                ].join(" ")}
              >
                {bucket.label}
              </div>
            </div>

            {i < BUCKETS.length - 1 && (
              <div
                className={[
                  "mb-[13px] h-0.5 flex-1 transition-colors duration-200",
                  isCompleted ? "bg-tripoly-green" : "bg-tripoly-border",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
