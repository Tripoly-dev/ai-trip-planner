import type { Metadata } from "next";

// Self-hosted (via @fontsource) instead of next/font/google — see build note in
// TRIPOLY_HANDOFF.md decisions: avoids a runtime dependency on Google's font CDN.
// Poppins bundles include the devanagari subset, so Hindi (HI) copy renders in the
// same font rather than falling back to a system font.
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/400-italic.css";

// Day titles only, per handoff section 5.
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/800.css";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trip Planner",
  description: "Plan your perfect trip — AI-powered voice + text itinerary planner by Tripoly",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
