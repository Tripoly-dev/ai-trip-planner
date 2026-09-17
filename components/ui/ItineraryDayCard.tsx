// Screen 5A/5B — one day's plan. Per TRIPOLY_HANDOFF.md section 7 (05A spec —
// identical card markup is reused for 05B, only the map above it differs).
//
// Meal pills show only the category label (Breakfast/Lunch/Dinner), matching the
// mockup exactly — the mockup keeps these as plain indicator chips even though the
// day title/hotel/activities/tip around them show real generated content. The
// actual meals.breakfast/lunch/dinner text from Claude isn't surfaced on this card.

import { Car, Hotel, IndianRupee, Lightbulb, Map } from "lucide-react";
import type { DayPlan } from "@/store/useTripStore";
import { StarRating } from "@/components/ui/StarRating";

// Design-audit fix (item 7): every emoji here (🏨🗺️💰🚗💡) was a functional icon standing
// in for a real one — now lucide-react, matching ChatBubble.tsx/BottomNav.tsx after the
// same fix. 13px, matching the surrounding text size these sit inline with.
export function ItineraryDayCard({ day }: { day: DayPlan }) {
  return (
    <div className="rounded-xl border-l-[3px] border-tripoly-green bg-white p-4 shadow-tripoly-card">
      <div className="mb-2.5 font-serif text-lg font-bold text-black">{day.title}</div>

      <div className="mb-2 flex items-center gap-1.5 font-sans text-sm text-[#333]">
        <Hotel width={13} height={13} strokeWidth={2} className="flex-shrink-0 text-[#333]" />
        {day.hotel.name} · <StarRating stars={day.hotel.stars} />
      </div>

      <div className="mb-2.5 flex gap-1.5">
        <span className="rounded-[10px] bg-[#f2f2f2] px-2.5 py-[5px] font-sans text-[11px] text-[#555]">
          Breakfast
        </span>
        <span className="rounded-[10px] bg-[#f2f2f2] px-2.5 py-[5px] font-sans text-[11px] text-[#555]">
          Lunch
        </span>
        <span className="rounded-[10px] bg-[#f2f2f2] px-2.5 py-[5px] font-sans text-[11px] text-[#555]">
          Dinner
        </span>
      </div>

      <div className="mb-2 font-sans text-[13px] leading-[1.7] text-[#333]">
        <span className="inline-flex items-center gap-1.5 align-middle">
          <Map width={13} height={13} strokeWidth={2} className="flex-shrink-0 text-[#333]" />
        </span>{" "}
        Morning: {day.activities.morning}
        <br />
        Afternoon: {day.activities.afternoon}
        <br />
        Evening: {day.activities.evening}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 font-sans text-xs font-semibold text-tripoly-green">
          <IndianRupee width={12} height={12} strokeWidth={2.5} className="flex-shrink-0" />
          {day.estimated_daily_cost.toLocaleString("en-IN")} est.
        </div>
        <div className="flex items-center gap-1 font-sans text-xs text-tripoly-text-muted">
          <Car width={13} height={13} strokeWidth={2} className="flex-shrink-0" />
          {day.drive_time} driving
        </div>
      </div>

      <div className="flex items-start gap-1.5 font-sans text-[13px] italic text-tripoly-text-muted">
        <Lightbulb width={13} height={13} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
        Tip: {day.tip}
      </div>
    </div>
  );
}
