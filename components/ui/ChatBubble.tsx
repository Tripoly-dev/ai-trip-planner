import type { Message } from "@/store/useTripStore";

// Screen 3 — chat bubble. 4 variants per TRIPOLY_HANDOFF.md section 7: bot, user,
// off-topic, error.

export interface ChatBubbleProps {
  role: Message["role"];
  children: React.ReactNode;
}

function BotAvatar() {
  return (
    <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-tripoly-green">
      <svg width="14" height="14" viewBox="0 0 36 36" aria-hidden="true">
        <rect x="4" y="4" width="10" height="28" rx="3" fill="#fff" />
        <rect x="4" y="4" width="28" height="9" rx="3" fill="#fff" />
      </svg>
    </span>
  );
}

function OffTopicAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-tripoly-bubble-offtopic text-xs"
    >
      ✈️
    </span>
  );
}

function ErrorAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-tripoly-bubble-error text-xs font-semibold text-tripoly-error"
    >
      !
    </span>
  );
}

export function ChatBubble({ role, children }: ChatBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-md bg-tripoly-green px-4 py-3 font-sans text-[15px] text-white">
          {children}
        </div>
      </div>
    );
  }

  if (role === "offtopic") {
    return (
      <div className="flex items-end gap-2">
        <OffTopicAvatar />
        <div className="max-w-[78%] rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-md bg-tripoly-bubble-offtopic px-4 py-3 font-sans text-sm text-tripoly-text-muted">
          {children}
        </div>
      </div>
    );
  }

  if (role === "error") {
    return (
      <div className="flex items-end gap-2">
        <ErrorAvatar />
        <div className="max-w-[78%] rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-md bg-tripoly-bubble-error px-4 py-3 font-sans text-sm text-tripoly-error">
          {children}
        </div>
      </div>
    );
  }

  // role === "bot"
  return (
    <div className="flex items-end gap-2">
      <BotAvatar />
      <div className="max-w-[78%] rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-md bg-tripoly-bubble-bot px-4 py-3 font-sans text-[15px] text-tripoly-text">
        {children}
      </div>
    </div>
  );
}
