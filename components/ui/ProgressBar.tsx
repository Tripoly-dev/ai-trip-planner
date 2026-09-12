import type { ChatStep } from "@/store/useTripStore";

// Screen 3 header — 6-step chat progress bar.
// Per TRIPOLY_HANDOFF.md section 7: Active step = filled dot, Completed = green tick,
// Pending = grey dot.

const STEP_LABELS: Record<ChatStep, string> = {
  1: "Name",
  2: "Destination",
  3: "Duration",
  4: "Budget",
  5: "Travelers",
  6: "Vibe",
};

const STEPS: ChatStep[] = [1, 2, 3, 4, 5, 6];

export interface ProgressBarProps {
  currentStep: ChatStep;
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;

        return (
          <div key={step} className="contents">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={[
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-sans",
                  isCompleted || isActive
                    ? "bg-tripoly-green text-white"
                    : "bg-white border border-tripoly-border text-tripoly-text-muted",
                ].join(" ")}
              >
                {isCompleted ? "✓" : ""}
              </div>
              <div
                className={[
                  "font-sans text-[9px] font-medium",
                  isCompleted || isActive ? "text-tripoly-text" : "text-tripoly-text-muted",
                ].join(" ")}
              >
                {STEP_LABELS[step]}
              </div>
            </div>

            {i < STEPS.length - 1 && (
              <div
                className={[
                  "mb-[13px] h-0.5 flex-1",
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
