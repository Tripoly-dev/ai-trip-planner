// Unsplash Photos API helper — server-only. Never called from client components;
// UNSPLASH_ACCESS_KEY must only ever be read here and in one-off local scripts,
// same convention as lib/sarvam.ts / lib/claude.ts for their respective keys.
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

const UNSPLASH_API_URL = "https://api.unsplash.com";

export interface UnsplashPhoto {
  url: string; // "regular" size (1080px wide) — Unsplash's recommended size for full-width web use
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
export async function searchDestinationPhoto(query: string): Promise<UnsplashPhoto | null> {
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
    url: first.urls.regular,
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
