// One-off script — NOT part of the running app. Run this yourself, once, to pull
// candidate photos for 10 new international destinations for the Home screen's new
// scrolling image wall (on top of the 7 already hardcoded in lib/constants.ts from
// scripts/fetch-home-photos.mjs). Prints plain photo URLs + photographer credit
// (no secrets) — paste the output back.
//
// Usage:  node scripts/fetch-more-destinations.mjs

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

// 10 new destinations, deliberately distinct from what's already hardcoded (Bali, Kyoto,
// Vietnam, Maldives, Dubai, Switzerland) and international-only, per your call on the Home
// carousel. 3 candidates each so there's real choice per destination, not just one shot.
const DESTINATIONS = [
  { id: "santorini", query: "Santorini Greece caldera sunset" },
  { id: "paris", query: "Paris France Eiffel Tower" },
  { id: "singapore", query: "Singapore skyline Marina Bay" },
  { id: "iceland", query: "Iceland glacier waterfall landscape" },
  { id: "new-zealand", query: "New Zealand fjord mountains" },
  { id: "phuket", query: "Phuket Thailand beach longtail boat" },
  { id: "egypt", query: "Egypt pyramids Giza desert" },
  { id: "cappadocia", query: "Cappadocia Turkey hot air balloons" },
  { id: "marrakech", query: "Marrakech Morocco medina" },
  { id: "norway", query: "Norway fjord village dramatic" },
];

async function fetchCandidates({ id, query }) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait"); // wall tiles are portrait, like the hero
  url.searchParams.set("content_filter", "high");
  url.searchParams.set("per_page", "3");

  const res = await fetch(url, { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } });
  if (!res.ok) {
    throw new Error(`${id}: Unsplash search failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.results.map((r, i) => ({
    destination: id,
    candidate: i + 1,
    url: r.urls.regular,
    photographerName: r.user.name,
    photographerProfileUrl: `${r.user.links.html}?utm_source=tripoly&utm_medium=referral`,
  }));
}

const results = [];
for (const dest of DESTINATIONS) {
  // Sequential, not Promise.all — 10 queries is well within the demo tier's 50/hour, no
  // need to burst them.
  results.push(...(await fetchCandidates(dest)));
}

console.log(JSON.stringify(results, null, 2));
