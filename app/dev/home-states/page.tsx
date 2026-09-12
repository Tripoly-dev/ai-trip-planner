"use client";

// Internal QA-only harness for Step 4 — lets both Home screen variants (02A returning
// user / 02B new user) be triggered and screenshotted without the real chat/API flow
// that normally populates the store. Remove before Step 12.

import { HomeScreen } from "@/components/screens/HomeScreen";
import { useTripStore } from "@/store/useTripStore";

const DEMO_ITINERARY = {
  trip_summary: {
    name: "Kaushik",
    destination: "Bali",
    duration_nights: 7,
    total_budget: 200000,
    per_person_budget: 50000,
    traveler_count: 4,
    group_type: "Family",
    theme: "Family",
    dates_suggested: "Oct 5 – 12",
  },
  days: [],
};

export default function HomeStatesPage() {
  const setItinerary = useTripStore((s) => s.setItinerary);
  const setField = useTripStore((s) => s.setField);
  const resetTrip = useTripStore((s) => s.resetTrip);

  return (
    <div>
      <div className="fixed left-0 top-0 z-50 flex gap-2 bg-black/80 p-2">
        <button
          className="rounded bg-white px-3 py-1 text-xs"
          onClick={() => {
            setField("name", "Kaushik");
            setItinerary(DEMO_ITINERARY);
          }}
        >
          Show 02A (returning user)
        </button>
        <button className="rounded bg-white px-3 py-1 text-xs" onClick={() => resetTrip()}>
          Show 02B (new user)
        </button>
      </div>
      <HomeScreen />
    </div>
  );
}
