// One-off script — NOT part of the running app. Run this yourself, once, after adding
// UNSPLASH_ACCESS_KEY to .env.local, to fetch the fixed set of Home-screen destination
// photos. It prints plain photo URLs + photographer credit (no secrets) — paste that
// output back so it can be hardcoded into lib/constants.ts. Nothing here touches your
// key beyond reading it locally to make the request.
//
// Usage:  node scripts/fetch-home-photos.mjs

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

// The 6 unique destinations across the carousel + bento mosaic (Goa/Himachal already
// dropped — international-only, per your call). Query strings are deliberately specific
// (not just the bare name) to steer Unsplash toward an iconic, recognizable shot rather
// than an arbitrary/ambiguous photo — e.g. plain "Georgia" would risk the US state.
const DESTINATIONS = [
  { id: "bali", query: "Bali Indonesia beach temple" },
  { id: "kyoto", query: "Kyoto Japan autumn temple" },
  { id: "dubai", query: "Dubai UAE skyline" },
  { id: "vietnam", query: "Vietnam Ha Long Bay" },
  { id: "maldives", query: "Maldives overwater villa" },
  { id: "switzerland", query: "Switzerland Alps lake" },
];

async function fetchPhoto({ id, query }) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");
  url.searchParams.set("per_page", "1");

  const res = await fetch(url, { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } });
  if (!res.ok) {
    throw new Error(`${id}: Unsplash search failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const first = data.results?.[0];
  if (!first) {
    console.warn(`${id}: no result for "${query}"`);
    return null;
  }
  return {
    id,
    url: first.urls.regular,
    photographerName: first.user.name,
    photographerProfileUrl: `${first.user.links.html}?utm_source=tripoly&utm_medium=referral`,
  };
}

const results = [];
for (const dest of DESTINATIONS) {
  // Sequential, not Promise.all — demo tier is 50 req/hour, no need to burst 6 at once.
  results.push(await fetchPhoto(dest));
}

console.log(JSON.stringify(results.filter(Boolean), null, 2));
