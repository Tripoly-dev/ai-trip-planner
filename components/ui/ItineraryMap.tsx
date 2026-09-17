"use client";

// Real map for the Itinerary screen — replaces the two fixed/decorative placeholders
// that used to live there (a plain SVG pin, and a fixed "Your City" -> destination arc
// with the same coordinates every single time). Per your call: coordinates come from
// Claude alongside the rest of the itinerary (lib/claude.ts, sanitized there before this
// ever sees them), rendered with Leaflet + free OpenStreetMap/CARTO tiles — no API key,
// no billing account.
//
// Imported via next/dynamic with ssr:false in ItineraryScreen.tsx: Leaflet touches
// `window` at import time in places, which breaks during Next's server-side prerender
// pass even inside a "use client" file — ssr:false is the standard, necessary fix.
//
// Markers use a hand-drawn SVG divIcon (not Leaflet's default L.Icon) for two reasons:
// it matches the existing pin illustration's exact shape/green (components/screens/
// ItineraryScreen.tsx's old placeholder), and it sidesteps a well-known Leaflet+bundler
// gotcha where the default marker's image paths break under webpack/Turbopack.

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

export interface ItineraryMapPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface ItineraryMapProps {
  points: ItineraryMapPoint[];
  activeId?: string | null;
  // "Cinematic" toggle (ItineraryScreen.tsx) — same real pins/route, different tile style,
  // so the toggle stays meaningful now that both sides are a real map.
  dark?: boolean;
}

const LIGHT_TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

// CARTO's free "dark matter" tiles — same no-key/no-billing bar as the OSM tiles above.
const DARK_TILES = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

function pinIcon(active: boolean) {
  const size = active ? 34 : 26;
  return L.divIcon({
    className: "",
    html: `
      <div style="width:${size}px;height:${size}px;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
        <svg viewBox="0 0 24 24" width="${size}" height="${size}">
          <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"
                fill="${active ? "#16CF76" : "#ffffff"}"
                stroke="${active ? "#0c8f4e" : "#16CF76"}" stroke-width="1.5" />
          <circle cx="12" cy="10" r="3" fill="${active ? "#ffffff" : "#16CF76"}" />
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

// MapContainer's center/zoom only set the INITIAL view — panning when `activeId` changes
// needs an imperative call via react-leaflet's useMap() hook, the standard pattern for it.
function PanToActive({ point }: { point: ItineraryMapPoint | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
    // Keyed on the point's actual id/coordinates, not the object reference: the caller
    // (ItineraryScreen.tsx) recomputes its points array inline on every render — including
    // ones unrelated to map selection, e.g. every keystroke in the amendment box — which
    // would otherwise replay the fly-to animation constantly instead of only when the
    // selected day or its coordinates genuinely change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id, point?.lat, point?.lng, map]);
  return null;
}

export function ItineraryMap({ points, activeId, dark = false }: ItineraryMapProps) {
  if (points.length === 0) return null;

  const tiles = dark ? DARK_TILES : LIGHT_TILES;
  const active = points.find((p) => p.id === activeId);
  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const avgLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  const bounds: L.LatLngBoundsExpression | undefined =
    points.length > 1 ? points.map((p) => [p.lat, p.lng] as [number, number]) : undefined;

  return (
    <MapContainer
      center={[avgLat, avgLng]}
      zoom={11}
      bounds={bounds}
      boundsOptions={{ padding: [32, 32] }}
      className="h-full w-full"
      scrollWheelZoom={false}
      zoomControl={false}
    >
      <TileLayer url={tiles.url} attribution={tiles.attribution} />
      {points.length > 1 && (
        <Polyline
          positions={points.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#16CF76", weight: 3, dashArray: "8 8" }}
        />
      )}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.id === activeId)}>
          <Popup>{p.label}</Popup>
        </Marker>
      ))}
      <PanToActive point={active} />
    </MapContainer>
  );
}
