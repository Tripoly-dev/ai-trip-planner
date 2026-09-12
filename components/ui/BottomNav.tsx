import Link from "next/link";

// Fixed bottom navigation. Per TRIPOLY_HANDOFF.md section 12:
// shown on Home (02A/02B) and Itinerary (05A/05B) only — not Welcome, Chat, Processing, PDF.
// 5 tabs; the center "Ask" tab is an elevated FAB, always green regardless of active screen.

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

function ItineraryIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden="true">
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M6 17 18 7" />
    </svg>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
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

export function BottomNav({ active }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex h-[76px] items-start justify-around border-t border-tripoly-border bg-white pb-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      aria-label="Primary"
    >
      <NavItem href="/home" label="Home" isActive={active === "home"} icon={(c) => <HomeIcon color={c} />} />
      <NavItem href="/trips" label="Trips" isActive={active === "trips"} icon={(c) => <TripsIcon color={c} />} />

      <Link href="/chat" className="flex flex-col items-center gap-1 -mt-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tripoly-green shadow-[0_4px_12px_rgba(22,207,118,0.35)]">
          <AskIcon />
        </span>
        <span className="font-sans text-[10px] font-medium text-tripoly-text-muted">Ask</span>
      </Link>

      <NavItem
        href="/itinerary"
        label="Itinerary"
        isActive={active === "itinerary"}
        icon={(c) => <ItineraryIcon color={c} />}
      />
      <NavItem
        href="/profile"
        label="Profile"
        isActive={active === "profile"}
        icon={(c) => <ProfileIcon color={c} />}
      />
    </nav>
  );
}
