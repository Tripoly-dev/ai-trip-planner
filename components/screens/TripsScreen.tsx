"use client";

// Trips tab — new screen. BottomNav.tsx already had a "Trips" tab wired to /trips (icon,
// label, route), but no page existed for it yet, so it 404'd. No mockup exists for this
// screen in TRIPOLY_HANDOFF.md — it was explicitly out of scope there (section 18, Phase 2:
// "Trip dashboard screen"). Built now at your request, deliberately scoped down from that
// Phase 2 vision: no backend, no login — every generated trip is saved to this device's
// localStorage only (see useTripStore.ts's `persist` wrapper). Visual language matches the
// rest of the app rather than inventing a new style: same card shape/gradient/badge
// treatment as the old Home "Upcoming Journey" card and DestinationCard.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomNav, DESKTOP_SIDEBAR_WIDTH_CLASS } from "@/components/ui/BottomNav";
import { useTripStore, type SavedTrip } from "@/store/useTripStore";

function TripListCard({ trip, onOpen }: { trip: SavedTrip; onOpen: () => void }) {
  const { trip_summary: summary } = trip.itinerary;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block h-[150px] w-full overflow-hidden rounded-[20px] text-left shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-transform active:scale-[0.98]"
    >
      {summary.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={summary.photo.url}
          alt={summary.destination}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-tripoly-green/40 to-black/40" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/70" />
      <div className="absolute right-3.5 top-3.5 rounded-xl bg-tripoly-green px-3 py-1.5 font-sans text-[11px] font-semibold text-white">
        {summary.duration_nights} nights
      </div>
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between">
        <div>
          <div className="font-sans text-[17px] font-bold text-white">{summary.destination}</div>
          <div className="mt-0.5 font-sans text-[13px] text-white/90">{summary.dates_suggested}</div>
        </div>
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/25">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-8 pt-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tripoly-muted">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16CF76" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
        </svg>
      </div>
      <div className="font-sans text-base font-semibold text-tripoly-text">No trips yet</div>
      <div className="mt-1.5 font-sans text-[13px] leading-snug text-tripoly-text-muted">
        Every trip you generate is saved here automatically — plan your first one to see it show up.
      </div>
      <Link
        href="/chat"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-tripoly-green px-8 font-sans text-[14px] font-semibold text-white shadow-[0_4px_20px_rgba(22,207,118,0.25)]"
      >
        Plan a Trip ✈️
      </Link>
    </div>
  );
}

export function TripsScreen() {
  const router = useRouter();
  const savedTrips = useTripStore((s) => s.savedTrips);
  const loadSavedTrip = useTripStore((s) => s.loadSavedTrip);

  // Newest first — savedTrips is stored oldest-last (append-only in the store).
  const trips = [...savedTrips].reverse();

  function openTrip(id: string) {
    loadSavedTrip(id);
    router.push("/itinerary");
  }

  return (
    <main className={`relative min-h-dvh bg-white pb-24 lg:pb-10 ${DESKTOP_SIDEBAR_WIDTH_CLASS}`}>
      <div className="px-5 pt-6 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-10">
        <div className="mb-5 font-sans text-[22px] font-bold text-tripoly-text">Your Trips</div>

        {trips.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {trips.map((trip) => (
              <TripListCard key={trip.id} trip={trip} onOpen={() => openTrip(trip.id)} />
            ))}
          </div>
        )}
      </div>

      <BottomNav active="trips" />
    </main>
  );
}
