// Shared Tripoly logo mark (T + plane), extracted from the mockup where it recurs
// identically across Welcome, Chat header, and PDF header. Not one of Step 2's 7 named
// components — added here in Step 3 to avoid triplicating this inline SVG.
//
// "white" = white T + green plane, for dark/photo backgrounds (Welcome, PDF header).
// "dark"  = black T + green plane, for light backgrounds (Chat header).

export interface TripolyMarkProps {
  variant?: "white" | "dark";
  size?: number;
}

export function TripolyMark({ variant = "dark", size = 30 }: TripolyMarkProps) {
  const tColor = variant === "white" ? "#fff" : "#000";

  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="4" y="4" width="10" height="28" rx="3" fill={tColor} />
      <rect x="4" y="4" width="28" height="9" rx="3" fill={tColor} />
      <path
        d="M25 20 L33 15 L33 18 L27 22 L27 27 L30 29 L30 31 L25 30 L20 31 L20 29 L23 27 L23 22 L17 18 L17 15 Z"
        fill="#16CF76"
      />
    </svg>
  );
}
