// Shared Tripoly brand mark — Welcome, Chat header, Bottom Nav, Processing header, PDF header.
//
// Replaces the original hand-drawn placeholder SVG (a "T" shape + plane, invented before the
// real logo existed) with the actual brand assets you provided, per your two confirmed choices:
//  - The 3 small/tight spots (ChatScreen 22px, ProcessingScreen 26px, BottomNav 26px) show the
//    icon alone (no wordmark) — these already pass variant="dark", so that value now renders
//    /public/brand/tripoly-icon.png, cropped tightly from your file.
//  - The 2 spots with more room, both on a dark/colored background (PdfScreen header,
//    Welcome hero) show the full icon+"tripoly" lockup — these already pass variant="white",
//    so that value now renders /public/brand/tripoly-lockup-white.png: your lockup with just
//    the black wordmark pixels recolored to white (the green icon, #16CF76 — matching
//    tripoly-green elsewhere in this app exactly — was left untouched). Generated with Pillow;
//    verified visually against a dark background before use, since it's a derived asset, not
//    the file you sent.
//  - A black-wordmark full lockup (your original file, tightly trimmed) is also saved at
//    /public/brand/tripoly-lockup-black.png for a future light-background lockup spot, though
//    nothing currently uses it.
//
// Plain <img>, not next/image: matches this codebase's existing established choice for other
// user-facing images (app/page.tsx's hero photo, DestinationCard's photo slot) — both already
// opt out of next/image the same way, so this follows the same convention rather than mixing
// approaches. Source PNGs are 300px tall, comfortably higher-resolution than every display size
// here (20-30px), so a single asset per variant needs no additional @2x/@3x variants.

const ICON_ASPECT = 361 / 300; // public/brand/tripoly-icon.png
const LOCKUP_ASPECT = 1062 / 300; // public/brand/tripoly-lockup-white.png

export interface TripolyMarkProps {
  variant?: "white" | "dark";
  size?: number;
}

export function TripolyMark({ variant = "dark", size = 30 }: TripolyMarkProps) {
  const src = variant === "white" ? "/brand/tripoly-lockup-white.png" : "/brand/tripoly-icon.png";
  const aspect = variant === "white" ? LOCKUP_ASPECT : ICON_ASPECT;
  const width = Math.round(size * aspect);

  return (
    // Decorative — matches the original SVG's aria-hidden treatment. Every usage sits next to
    // page content (a header, a nav bar) that already identifies the app; empty alt is the
    // standard way to mark a purely decorative image for assistive tech.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={width} height={size} style={{ height: size, width }} />
  );
}
