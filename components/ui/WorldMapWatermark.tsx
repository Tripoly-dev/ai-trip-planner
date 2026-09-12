// Screen 6 (PDF) — faint world-map watermark behind the printable content.
// No maps/geography asset exists anywhere in this project (section 2's tech stack has no
// maps API) — this is a hand-built, abstract "continents" SVG in the same spirit as the
// pin/flight-path/logo marks elsewhere, not a geographically accurate map. Rendered at the
// spec's #F0FDF7 fill, which is already near-white against the page background, giving the
// "very faint" look the spec asks for without needing extra opacity on top.

// Tiled as a repeating pattern (not a single scaled-to-cover image) so it stays a
// consistent, correctly-proportioned texture regardless of how tall the page gets —
// a 2-night trip and a 10-night trip both just get more repeats of the same tile.
export function WorldMapWatermark() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <pattern id="tripoly-world-map" width="400" height="600" patternUnits="userSpaceOnUse">
          <path
            d="M20 80 Q60 40 110 60 Q150 75 130 110 Q170 120 160 150 Q120 170 90 145 Q50 160 40 120 Q10 110 20 80 Z"
            fill="#F0FDF7"
          />
          <path
            d="M240 40 Q300 20 340 55 Q370 70 350 100 Q380 130 340 150 Q300 175 270 145 Q230 150 220 110 Q210 70 240 40 Z"
            fill="#F0FDF7"
          />
          <path
            d="M60 260 Q110 240 140 275 Q160 310 130 340 Q140 380 100 400 Q60 420 40 385 Q10 360 25 320 Q10 290 60 260 Z"
            fill="#F0FDF7"
          />
          <path
            d="M220 300 Q280 280 330 310 Q370 330 355 370 Q390 400 350 430 Q310 460 270 435 Q220 450 200 410 Q180 370 200 335 Q190 310 220 300 Z"
            fill="#F0FDF7"
          />
          <path
            d="M80 460 Q140 445 180 475 Q210 500 185 530 Q195 560 155 575 Q110 590 85 560 Q55 545 65 505 Q45 480 80 460 Z"
            fill="#F0FDF7"
          />
          <path
            d="M280 500 Q330 490 355 520 Q375 545 345 565 Q320 585 290 570 Q260 575 255 545 Q240 515 280 500 Z"
            fill="#F0FDF7"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tripoly-world-map)" />
    </svg>
  );
}
