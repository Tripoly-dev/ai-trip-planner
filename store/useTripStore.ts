import { create } from "zustand";

// Matches TRIPOLY_HANDOFF.md section 6 exactly.
// Screen/validation logic that reads and writes this store is built out in later steps.

export type GroupType = "Family" | "Couple" | "Friends" | "Solo";
export type TravelTheme = "Relaxed" | "Adventure" | "Romantic" | "Family" | "Foodie";
export type Language = "EN" | "HI";
export type ChatStep = 1 | 2 | 3 | 4 | 5 | 6;
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
  currentStep: ChatStep;
  messages: Message[];
  isListening: boolean;
  isProcessing: boolean;
  isExtracting: boolean; // true while a chat answer is being resolved via the /api/extract-field fallback

  // Generated itinerary
  itinerary: Itinerary | null;
  itineraryView: ItineraryView; // default: '05A'

  // Actions
  setField: <K extends keyof TripStore>(key: K, value: TripStore[K]) => void;
  addMessage: (message: Message) => void;
  setStep: (step: ChatStep) => void;
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

  currentStep: 1 as ChatStep,
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
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setStep: (step) => set({ currentStep: step }),
  setItinerary: (itinerary) => set({ itinerary }),
  resetTrip: () => set({ ...initialState }),
}));
