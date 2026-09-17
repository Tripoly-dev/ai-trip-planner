// One-off script — NOT part of the running app. Run this yourself, once, to pull a
// handful of candidate photos for the Welcome-screen hero (app/page.tsx) across 3 moods,
// so you can look at real photos rather than decide blind. Prints plain photo URLs +
// photographer credit (no secrets) — paste the output back.
//
// Usage:  node scripts/fetch-hero-candidates.mjs

import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local may not exist yet — fall through, the key check below will explain.
  }
}

loadEnvLocal();

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
if (!ACCESS_KEY) {
  console.error(
    "UNSPLASH_ACCESS_KEY not found. Add it to .env.local first:\n" +
      "  UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here",
  );
  process.exit(1);
}

// 3 candidates per mood — one query per mood, per_page: 3, sorted by relevance (Unsplash's
// default). Deliberately avoids the exact destinations already used on the Home screen
// (Bali/Kyoto/Dubai/Vietnam/Maldives/Switzerland) so the hero doesn't visually repeat one
// of those cards.
const MOODS = [
  { id: "airplane", query: "airplane window wing sunset clouds flight" },
  { id: "scenic", query: "Santorini Greece sunset cliff dramatic" },
  { id: "global", query: "city skyline aerial dramatic dusk travel" },
];

async function fetchCandidates({ id, query }) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait"); // hero is a full-screen mobile-first background
  url.searchParams.set("content_filter", "high");
  url.searchParams.set("per_page", "3");

  const res = await fetch(url, { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } });
  if (!res.ok) {
    throw new Error(`${id}: Unsplash search failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.results.map((r, i) => ({
    mood: id,
    candidate: i + 1,
    url: r.urls.regular,
    photographerName: r.user.name,
    photographerProfileUrl: `${r.user.links.html}?utm_source=tripoly&utm_medium=referral`,
  }));
}

const results = [];
for (const mood of MOODS) {
  // Sequential, not Promise.all — no need to burst the demo tier's 50 req/hour for a
  // one-time, 3-query script.
  results.push(...(await fetchCandidates(mood)));
}

console.log(JSON.stringify(results, null, 2));
