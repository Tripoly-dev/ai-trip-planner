// Bilingual (EN/HI) static copy for the chat flow — every routine bot line and every
// local-validator error message the user can see, in both languages. This is what
// lets ChatScreen and lib/validators.ts stop hardcoding English and instead pick the
// right string for whatever language is active *at that moment* (read live per
// message — see ChatScreen's `language` usage).
//
// Source of truth for every EN string below: the literal text that was hardcoded in
// components/screens/ChatScreen.tsx and lib/validators.ts before this file existed —
// nothing here is invented copy, only translated/keyed.
//
// Deliberately NOT included: the "I heard '<value>'. Is that correct?" confirm-back
// lines and "Please answer yes or no." — that whole pendingConfirm mechanism was
// removed in the Option A redesign, so those strings have no home to move to.
// Also NOT included: OFF_TOPIC_MESSAGE (lib/validators.ts) — that stays English-only,
// unchanged, since it's still used by ItineraryScreen's separate amendment-box check,
// which is out of scope for this redesign.
//
// Pure-conversational rebuild update: the old afterName/afterDestination/afterDuration/
// afterBudget/afterTravelerCount/afterGroupType lines assumed a FIXED next step (e.g.
// "afterDuration" always asked for budget next) — that assumption breaks once fields
// can be collected in any order, so a canned line for "just finished step N" could ask
// for something already answered. Replaced by `askFor`, keyed by FIELD (not by "what
// came before"), used only by ChatScreen's local quick-chip acknowledgements — every
// free-text turn gets its reply from Claude itself (lib/chatTurn.ts), which always has
// full context of what's actually still missing. Same EN/HI content as the old lines,
// just re-keyed.

import type { Language } from "@/store/useTripStore";
import type { FieldKey } from "@/lib/fields";

export type Bilingual = { EN: string; HI: string };

/** Picks the string for the given language. Trivial, but keeps call sites uniform. */
export function t(copy: Bilingual, language: Language): string {
  return copy[language];
}

export const chatCopy = {
  greeting: {
    EN: "Hi! I'm Tripoly AI ✈️ What's your name?",
    HI: "नमस्ते! मैं Tripoly AI हूँ ✈️ आपका नाम क्या है?",
  } satisfies Bilingual,

  // Used only by ChatScreen's local, no-API-call quick-chip acknowledgements (duration/
  // budget/travelers/group/theme chips) — after applying the tap, ChatScreen looks up
  // whatever the new next-missing-field actually is and asks for THAT, instead of a
  // fixed "next step." No "name" entry: there's no quick chip for name, so that local
  // path never needs to ask for it.
  askFor: {
    destination: {
      EN: "Where would you like to travel?",
      HI: "आप कहाँ घूमने जाना चाहेंगे?",
    },
    duration: {
      EN: "How many days are you planning? (max 10 days)",
      HI: "आप कितने दिनों की योजना बना रहे हैं? (अधिकतम 10 दिन)",
    },
    budget: {
      EN: "What is your total trip budget?",
      HI: "आपका कुल ट्रिप बजट कितना है?",
    },
    travelerCount: {
      EN: "How many travelers?",
      HI: "कितने यात्री जाएंगे?",
    },
    groupType: {
      EN: "And what's your group type?",
      HI: "और आपका ग्रुप टाइप क्या है?",
    },
    theme: {
      EN: "What kind of trip are you looking for?",
      HI: "आप किस तरह की ट्रिप चाहते हैं?",
    },
  } satisfies Partial<Record<FieldKey, Bilingual>>,

  // Shown (alongside the recap + confirm button) once all 7 fields are collected and
  // the user isn't actively changing anything.
  readyToGenerate: {
    EN: "Everything looks great! Ready to generate your trip?",
    HI: "सब कुछ तैयार है! क्या मैं आपकी ट्रिप बनाऊं?",
  } satisfies Bilingual,

  generatingItinerary: (destination: string): Bilingual => ({
    EN: `Perfect! Generating your ${destination || "trip"} itinerary now... ✨`,
    HI: `बढ़िया! आपकी ${destination || "ट्रिप"} की योजना तैयार हो रही है... ✨`,
  }),

  placeholder: {
    EN: "Type or speak your answer...",
    HI: "टाइप करें या बोलकर जवाब दें...",
  } satisfies Bilingual,

  quickChipCustom: {
    EN: "Custom",
    HI: "अपनी राशि",
  } satisfies Bilingual,

  errors: {
    // validateName
    nameInvalid: {
      EN: "Please enter a valid name (letters only).",
      HI: "कृपया एक सही नाम दर्ज करें (केवल अक्षर)।",
    } satisfies Bilingual,
    nameTooLong: {
      EN: "Please enter just your name.",
      HI: "कृपया सिर्फ़ अपना नाम बताएं।",
    } satisfies Bilingual,
    // ChatScreen's own post-extraction re-check (name.length < 2)
    nameTooShortAfterExtraction: {
      EN: "Please enter a valid name.",
      HI: "कृपया एक सही नाम दर्ज करें।",
    } satisfies Bilingual,

    // validateDestination (also reused by ChatScreen's post-extraction re-check —
    // both used the exact same English string already)
    destinationTooShort: {
      EN: "Please enter at least 3 characters.",
      HI: "कृपया कम से कम 3 अक्षर दर्ज करें।",
    } satisfies Bilingual,
    destinationTooLong: {
      EN: "Please enter just the destination.",
      HI: "कृपया सिर्फ़ जगह का नाम बताएं।",
    } satisfies Bilingual,

    // validateDuration
    durationMissing: {
      EN: "Please tell me the number of days (max 10).",
      HI: "कृपया दिनों की संख्या बताएं (अधिकतम 10)।",
    } satisfies Bilingual,
    durationRange: {
      EN: "Please enter between 1 and 10 days.",
      HI: "कृपया 1 से 10 दिनों के बीच बताएं।",
    } satisfies Bilingual,

    // validateTravelerCount
    travelersMissing: {
      EN: "Please tell me how many travelers.",
      HI: "कृपया बताएं कितने यात्री होंगे।",
    } satisfies Bilingual,
    travelersRange: {
      EN: "Please enter between 1 and 50 travelers.",
      HI: "कृपया 1 से 50 यात्रियों के बीच बताएं।",
    } satisfies Bilingual,

    // matchGroupType (also ChatScreen's post-extraction re-check — same string)
    groupTypeChoice: {
      EN: "Please choose one: Family, Couple, Friends, or Solo.",
      HI: "कृपया इनमें से एक चुनें: Family, Couple, Friends, या Solo।",
    } satisfies Bilingual,

    // parseBudget / finalizeBudget
    budgetInvalid: {
      EN: "Please enter a valid budget (e.g. ₹2 lakhs, 2L, or ₹2,00,000).",
      HI: "कृपया एक सही बजट बताएं (जैसे ₹2 लाख, 2L, या ₹2,00,000)।",
    } satisfies Bilingual,
    budgetMin: (formattedAmount: string): Bilingual => ({
      EN: `Minimum budget is ${formattedAmount}.`,
      HI: `न्यूनतम बजट ${formattedAmount} है।`,
    }),

    // theme (ChatScreen local match + matchTheme in lib/validators.ts — same string both places)
    themeChoice: {
      EN: "Please pick one of the options below.",
      HI: "कृपया नीचे दिए गए विकल्पों में से एक चुनें।",
    } satisfies Bilingual,

    // Generic fallback for a /api/chat-turn network/API failure — there's no local
    // validator result to fall back to anymore (every free-text turn calls Claude),
    // so this replaces what used to be an implicit fallback to the local error.
    chatTurnFailed: {
      EN: "Sorry, something went wrong. Please try again.",
      HI: "माफ़ कीजिए, कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
    } satisfies Bilingual,
  },

  mic: {
    permissionDenied: {
      EN: "Couldn't access your microphone. Please check permissions or type your answer.",
      HI: "माइक्रोफ़ोन एक्सेस नहीं हो पाया। कृपया अनुमति जांचें या टाइप करके जवाब दें।",
    } satisfies Bilingual,
    silence: {
      EN: "I didn't catch that — please try again.",
      HI: "मैं समझ नहीं पाया — कृपया दोबारा कोशिश करें।",
    } satisfies Bilingual,
    unclear: {
      EN: "Sorry, I couldn't hear that clearly. Please try again or type your answer.",
      HI: "माफ़ कीजिए, साफ़ सुनाई नहीं दिया। कृपया दोबारा कोशिश करें या टाइप करें।",
    } satisfies Bilingual,
    failed: {
      EN: "Voice transcription failed. Please try again or type your answer.",
      HI: "वॉइस ट्रांसक्रिप्शन विफल रहा। कृपया दोबारा कोशिश करें या टाइप करें।",
    } satisfies Bilingual,
    unsupported: {
      EN: "Voice input isn't supported in this browser — please type your answer",
      HI: "इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं है — कृपया टाइप करें",
    } satisfies Bilingual,
    tapToSpeak: {
      EN: "Tap to speak",
      HI: "बोलने के लिए टैप करें",
    } satisfies Bilingual,
    tapToStop: {
      EN: "Tap to stop",
      HI: "रोकने के लिए टैप करें",
    } satisfies Bilingual,
    cancel: {
      EN: "Cancel",
      HI: "रद्द करें",
    } satisfies Bilingual,
    send: {
      EN: "Send",
      HI: "भेजें",
    } satisfies Bilingual,
    clear: {
      EN: "Clear",
      HI: "मिटाएं",
    } satisfies Bilingual,
  },

  hints: {
    listening: {
      EN: "🎙️ Listening... tap to stop",
      HI: "🎙️ सुन रहा हूँ... रोकने के लिए टैप करें",
    } satisfies Bilingual,
    transcribing: {
      EN: "Transcribing...",
      HI: "ट्रांसक्राइब हो रहा है...",
    } satisfies Bilingual,
    thinking: {
      EN: "Thinking...",
      HI: "सोच रहा हूँ...",
    } satisfies Bilingual,
    reviewVoice: {
      EN: "Edit if needed, then send",
      HI: "ज़रूरत हो तो बदलें, फिर भेजें",
    } satisfies Bilingual,
    name: {
      EN: "Letters only, min 2 characters",
      HI: "केवल अक्षर, कम से कम 2 अक्षर",
    } satisfies Bilingual,
    destination: {
      EN: "Any destination, min 3 characters",
      HI: "कोई भी जगह, कम से कम 3 अक्षर",
    } satisfies Bilingual,
    duration: {
      EN: "Numbers only, max 10 days",
      HI: "केवल संख्या, अधिकतम 10 दिन",
    } satisfies Bilingual,
    budget: {
      EN: "e.g. 2 lakhs, 2L, or ₹2,00,000",
      HI: "जैसे 2 लाख, 2L, या ₹2,00,000",
    } satisfies Bilingual,
    travelerCount: {
      EN: "Numbers only, 1–50 travelers",
      HI: "केवल संख्या, 1–50 यात्री",
    } satisfies Bilingual,
    groupType: {
      EN: "Family, Couple, Friends, or Solo",
      HI: "Family, Couple, Friends, या Solo",
    } satisfies Bilingual,
    theme: {
      EN: "Tap a vibe below, or type it",
      HI: "नीचे से एक वाइब चुनें, या टाइप करें",
    } satisfies Bilingual,
    // Shown once every field is collected (the recap/confirm moment) — replaces a
    // per-field hint since there's no longer a single "next field" to describe.
    ready: {
      EN: "Ready to generate, or tell me if you'd like to change anything",
      HI: "जनरेट करने के लिए तैयार — या कुछ बदलना हो तो बताएं",
    } satisfies Bilingual,
  },
};
