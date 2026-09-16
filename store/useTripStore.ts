import { create } from "zustand";

// Matches TRIPOLY_HANDOFF.md section 6, minus the ChatStep/currentStep/setStep fixed
// step machine that used to live here. Pure-conversational rebuild (confirmed with
// you): the chat flow no longer has a fixed 1-6 step sequence gating what can be
// answered next — "what's still needed" is now computed live from which of the 7
// fields below are actually present, via lib/fields.ts's nextMissingField(). Removed
// entirely rather than left unused, since nothing after this rebuild reads a step
// number — see components/screens/ChatScreen.tsx, components/ui/ProgressBar.tsx, and
// components/screens/ProcessingScreen.tsx, all updated in the same change.

export type GroupType = "Family" | "Couple" | "Friends" | "Solo";
export type TravelTheme = "Relaxed" | "Adventure" | "Romantic" | "Family" | "Foodie";
export type Language = "EN" | "HI";
export type ItineraryView = "05A" | "05B";

export interface Message {
  id: string;
  role: "bot" | "user" | "error" | "offtopic";
  content: string;
  timestamp: Date;
}

export interface DayPlan {
  day: number;
  title: string;
  location: string;
  hotel: {
    name: string;
    stars: number;
    description: string;
  };
  meals: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
  activities: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  estimated_daily_cost: number;
  drive_time: string;
  day_description: string;
  tip: string;
}

export interface Itinerary {
  trip_summary: {
    name: string;
    destination: string;
    duration_nights: number;
    total_budget: number;
    per_person_budget: number;
    traveler_count: number;
    group_type: string;
    theme: string;
    dates_suggested: string;
  };
  days: DayPlan[];
}

export interface TripStore {
  // Collected inputs
  name: string;
  destination: string;
  duration: number; // in nights, max 10
  totalBudget: number; // in INR
  perPersonBudget: number; // auto-calculated
  travelerCount: number;
  groupType: GroupType | null;
  travelTheme: TravelTheme | null;
  language: Language;

  // Chat state
  messages: Message[];
  isListening: boolean;
  isProcessing: boolean;
  isExtracting: boolean; // true while a chat turn is being resolved via /api/chat-turn

  // Generated itinerary
  itinerary: Itinerary | null;
  itineraryView: ItineraryView; // default: '05A'

  // Actions
  setField: <K extends keyof TripStore>(key: K, value: TripStore[K]) => void;
  // Merges several fields in one atomic update — used by the unified chat-turn flow,
  // which can extract multiple fields (e.g. totalBudget AND travelerCount) from a
  // single message. A sequence of individual setField calls would work too, but
  // perPersonBudget needs to be recomputed from whichever of totalBudget/travelerCount
  // is now current after the WHOLE batch lands, not re-derived mid-batch from a stale
  // partial state — this does that recomputation once, atomically, regardless of which
  // of the two fields arrived this turn (or whether both did).
  applyFields: (fields: Partial<TripStore>) => void;
  addMessage: (message: Message) => void;
  setItinerary: (itinerary: Itinerary | null) => void;
  resetTrip: () => void;
}

const initialState = {
  name: "",
  destination: "",
  duration: 0,
  totalBudget: 0,
  perPersonBudget: 0,
  travelerCount: 0,
  groupType: null,
  travelTheme: null,
  language: "EN" as Language,

  messages: [],
  isListening: false,
  isProcessing: false,
  isExtracting: false,

  itinerary: null,
  itineraryView: "05A" as ItineraryView,
};

export const useTripStore = create<TripStore>((set) => ({
  ...initialState,

  setField: (key, value) => set({ [key]: value } as Pick<TripStore, typeof key>),
  applyFields: (fields) =>
    set((state) => {
      const totalBudget = fields.totalBudget ?? state.totalBudget;
      const travelerCount = fields.travelerCount ?? state.travelerCount;
      const perPersonBudget =
        totalBudget > 0 && travelerCount > 0 ? Math.round(totalBudget / travelerCount) : state.perPersonBudget;
      return { ...fields, perPersonBudget };
    }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setItinerary: (itinerary) => set({ itinerary }),
  resetTrip: () => set({ ...initialState }),
}));
