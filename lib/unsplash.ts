// Unsplash Photos API helper — server-only. Never called from client components;
// UNSPLASH_ACCESS_KEY must only ever be read here and in one-off local scripts,
// same convention as lib/sarvam.ts / lib/claude.ts for their respective keys.
//
// enrichItineraryWithPhotos() at the bottom of this file is the entry point
// app/api/generate-itinerary/route.ts calls after Claude returns a valid itinerary.
//
// Verified against Unsplash's current API docs (unsplash.com/documentation) before
// implementing, not assumed:
//   - Auth is `Authorization: Client-ID <access_key>` — the Access Key, not the
//     Secret Key (the Secret Key is only for OAuth user-login flows, which this
//     app doesn't use).
//   - Demo apps are rate-limited to 50 requests/hour; approved production apps get
//     1000/hour. Only calls to the JSON API count — hotlinked <img> requests do not.
//   - Two API Guideline requirements this file exists to satisfy:
//     1. Attribution — every use of a photo must credit the photographer and
//        Unsplash. photographerName/photographerProfileUrl below carry what's
//        needed to render that credit in the UI.
//     2. Hotlinking — the `url` returned is Unsplash's own CDN URL and must be
//        used directly (not re-hosted) wherever it's live-rendered in the app, so
//        photographers get view credit automatically. The one exception is PDF
//        export (html2canvas needs real pixel data, not a URL) — for that path,
//        after fetching+embedding the bytes, triggerUnsplashDownload() below pings
//        Unsplash's required "download" event so the photo still gets counted,
//        since the image is no longer a live hotlink at that point.

import type { Itinerary } from "@/store/useTripStore";

const UNSPLASH_API_URL = "https://api.unsplash.com";

export interface UnsplashPhoto {
  url: string;
  photographerName: string;
  photographerProfileUrl: string;
  downloadLocation: string; // ping via triggerUnsplashDownload() only when the photo is embedded (not hotlinked)
}

function authHeader(): Record<string, string> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured");
  }
  return { Authorization: `Client-ID ${key}` };
}

/** Searches for one best-matching landscape photo for a destination/place name. Returns null if no result. */
export async function searchDestinationPhoto(
  query: string,
  // "regular" (1080w) for a full-bleed hero; "small" (400w) for a thumbnail-sized slot —
  // both are Unsplash-provided pre-generated variants, not a query param hack on our end.
  size: "regular" | "small" = "regular",
): Promise<UnsplashPhoto | null> {
  const url = new URL(`${UNSPLASH_API_URL}/search/photos`);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");
  url.searchParams.set("per_page", "1");

  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) {
    throw new Error(`Unsplash search failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const first = data.results?.[0];
  if (!first) return null;

  return {
    url: first.urls[size],
    photographerName: first.user.name,
    // utm params per Unsplash's attribution guideline example (credit must link back to the photographer).
    photographerProfileUrl: `${first.user.links.html}?utm_source=tripoly&utm_medium=referral`,
    downloadLocation: first.links.download_location,
  };
}

/** Required ping when a photo is embedded (e.g. baked into a PDF as base64) rather than live-hotlinked. Best-effort — never throws. */
export async function triggerUnsplashDownload(downloadLocation: string): Promise<void> {
  try {
    await fetch(downloadLocation, { headers: authHeader() });
  } catch {
    // Best-effort tracking ping — must never block or fail the actual feature it's attached to.
  }
}

export interface EmbeddedPhoto {
  url: string; // base64 data: URI — see the file header for why this isn't a live hotlink
  photographerName: string;
  photographerProfileUrl: string;
}

/**
 * Searches for a photo, downloads the actual bytes server-side, and returns it as an
 * embeddable base64 data URI + credit. Used for anything that needs to survive an
 * html2canvas capture (the PDF flow) or that's simplest to keep as one code path shared
 * with on-screen rendering (the dynamic, per-itinerary photos — unlike the fixed Home-
 * screen set in lib/constants.ts, which stays hotlinked). Pings Unsplash's required
 * download-tracking event since the photo is no longer a live hotlink once embedded.
 * Throws on any failure (search or download) — callers fetching several photos should
 * catch per-call so one bad lookup doesn't take down the others.
 */
export async function fetchEmbeddablePhoto(
  query: string,
  size: "regular" | "small" = "regular",
): Promise<EmbeddedPhoto | null> {
  const found = await searchDestinationPhoto(query, size);
  if (!found) return null;

  const imageRes = await fetch(found.url);
  if (!imageRes.ok) {
    throw new Error(`Failed to download photo bytes (${imageRes.status})`);
  }
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

  // Fire-and-forget — triggerUnsplashDownload already swallows its own errors, and a
  // tracking ping must never delay or fail the actual feature it's attached to.
  void triggerUnsplashDownload(found.downloadLocation);

  return {
    url: dataUri,
    photographerName: found.photographerName,
    photographerProfileUrl: found.photographerProfileUrl,
  };
}

/**
 * Adds a `photo` credit to trip_summary and to every day of a generated itinerary.
 * Searches once per UNIQUE location — the overall destination plus every distinct
 * day.location — not once per day, so a multi-night stay in one city shares a single
 * photo instead of paying for a separate Unsplash call per day (rule 13 in lib/claude.ts's
 * system prompt already has Claude giving each stop 2+ nights, so this typically means a
 * handful of calls per itinerary, not one per night).
 *
 * Every lookup is independent and best-effort: a failure on one location (network error,
 * no result, rate limit, missing key) is logged and simply leaves that location's `photo`
 * undefined — it never blocks the other locations or the itinerary itself. This function
 * never throws; the itinerary Claude generated is always returned, photos or not, and
 * every call site (PdfScreen, PdfDayCard, HomeScreen's Upcoming Journey card) already has
 * a gradient-placeholder fallback for the no-photo case.
 *
 * Confirmed root cause of a real gap (one day's photo silently missing while others had
 * theirs): a day's own `location` string can legitimately return zero Unsplash search
 * results (not an error — searchDestinationPhoto returns null for that, nothing thrown, so
 * it never even hit the catch/log below) while a differently-worded location for the same
 * city elsewhere in the trip succeeds. Rather than leaving that one card blank, a day whose
 * own lookup comes up empty now falls back to the destination's own photo — destination
 * names are broad, reliably-covered search terms (the destination lookup already succeeds
 * far more consistently than a specific day's location), so this meaningfully cuts down on
 * "one random day has no photo" without adding a second network round trip: the destination
 * photo is already being fetched in this same loop regardless.
 */
export async function enrichItineraryWithPhotos(itinerary: Itinerary): Promise<Itinerary> {
  const destination = itinerary.trip_summary.destination;
  const locations = Array.from(new Set([destination, ...itinerary.days.map((d) => d.location)]));

  const photosByLocation = new Map<string, EmbeddedPhoto>();
  for (const location of locations) {
    // Sequential, not Promise.all — stay gentle on the demo-tier 50 requests/hour limit
    // rather than bursting every lookup for one itinerary at once.
    try {
      const size = location === destination ? "regular" : "small";
      const photo = await fetchEmbeddablePhoto(location, size);
      if (photo) photosByLocation.set(location, photo);
    } catch (err) {
      console.error(`[unsplash] photo lookup failed for "${location}", continuing without it:`, err);
    }
  }

  const destinationPhoto = photosByLocation.get(destination);

  return {
    trip_summary: {
      ...itinerary.trip_summary,
      photo: destinationPhoto,
    },
    days: itinerary.days.map((day) => ({
      ...day,
      photo: photosByLocation.get(day.location) ?? destinationPhoto,
    })),
  };
}
