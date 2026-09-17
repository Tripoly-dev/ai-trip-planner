import Link from "next/link";
import { TripolyMark } from "@/components/ui/TripolyMark";

// Navigation. Per TRIPOLY_HANDOFF.md section 12: shown on Home (02A/02B) and Itinerary
// (05A/05B) only — not Welcome, Chat, Processing, PDF. The center "Ask" tab is an
// elevated FAB, always green regardless of active screen.
//
// Per your request: the standalone "Itinerary" tab and the "Profile" tab (which has
// never pointed at a real page — app/profile has never existed) are gone. What was the
// "Trips" tab is now labeled "Itinerary" (href unchanged, still /trips — that's the
// list of every saved trip). Viewing a specific trip's detail page (app/itinerary,
// reached by tapping a card there) now highlights that same tab as active, since it's
// the closest thing to it in this 3-tab nav.
//
// Per section 13: "Bottom nav becomes left sidebar on desktop." Both variants render from
// this one component — the mobile bar (`lg:hidden`) and a desktop sidebar (`hidden lg:flex`)
// — sharing the same NavItems so the two never drift out of sync. NavItem's own markup
// (icon stacked over label) works unchanged in both a horizontal bar and a vertical rail,
// so nothing about the mobile bar's existing markup/classes changes.

export type BottomNavTab = "home" | "trips" | "ask" | "itinerary" | "profile";

export interface BottomNavProps {
  active: BottomNavTab;
}

const INACTIVE = "#BDBDBD";
const ACTIVE = "#16CF76";

function HomeIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function TripsIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" fill="#fff" />
      <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NavItem({
  href,
  label,
  isActive,
  icon,
}: {
  href: string;
  label: string;
  isActive: boolean;
  icon: (color: string) => React.ReactNode;
}) {
  const color = isActive ? ACTIVE : INACTIVE;

  return (
    <Link href={href} className="flex flex-col items-center gap-1 pt-2">
      {icon(color)}
      <span
        className="font-sans text-[10px] font-medium"
        style={{ color, fontWeight: isActive ? 600 : 500 }}
      >
        {label}
      </span>
    </Link>
  );
}

function NavItems({ active, askMarginClass }: { active: BottomNavTab; askMarginClass: string }) {
  return (
    <>
      <NavItem href="/home" label="Home" isActive={active === "home"} icon={(c) => <HomeIcon color={c} />} />

      <Link href="/chat" className={`flex flex-col items-center gap-1 ${askMarginClass}`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tripoly-green shadow-[0_4px_12px_rgba(22,207,118,0.35)]">
          <AskIcon />
        </span>
        <span className="font-sans text-[10px] font-medium text-tripoly-text-muted">Ask</span>
      </Link>

      {/* href unchanged (/trips) — label renamed. Also lights up for active === "itinerary"
          (ItineraryScreen, a specific trip's detail page), since that's reached from here. */}
      <NavItem
        href="/trips"
        label="Itinerary"
        isActive={active === "trips" || active === "itinerary"}
        icon={(c) => <TripsIcon color={c} />}
      />
    </>
  );
}

export function BottomNav({ active }: BottomNavProps) {
  return (
    <>
      {/* Mobile — unchanged from Step 4, just scoped to below the lg: breakpoint. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex h-[76px] items-start justify-around border-t border-tripoly-border bg-white pb-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden"
        aria-label="Primary"
      >
        <NavItems active={active} askMarginClass="-mt-6" />
      </nav>

      {/* Desktop — left sidebar, section 13. */}
      <nav
        className="fixed inset-y-0 left-0 z-10 hidden w-[88px] flex-col items-center border-r border-tripoly-border bg-white pt-6 lg:flex"
        aria-label="Primary"
      >
        <TripolyMark size={26} />
        <div className="mt-10 flex flex-col items-center gap-7">
          <NavItems active={active} askMarginClass="" />
        </div>
      </nav>
    </>
  );
}

// Sidebar width on desktop — screens that render BottomNav need matching lg:pl-[88px] so
// content doesn't sit underneath the fixed sidebar.
export const DESKTOP_SIDEBAR_WIDTH_CLASS = "lg:pl-[88px]";
