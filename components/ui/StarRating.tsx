// Shared ★☆ star-rating renderer — used by both the itinerary day card (Step 9) and the
// PDF day card (Step 10), which render the same hotel-stars value in the same format.

export function StarRating({ stars }: { stars: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <>
      {"★".repeat(filled)}
      {"☆".repeat(5 - filled)}
    </>
  );
}
