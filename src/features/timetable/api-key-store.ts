import { create } from "zustand";

const STORAGE_KEY = "tack-api-key";

interface ApiKeyState {
  apiKey: string | null;
  isHydrated: boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  hydrateApiKeyFromStorage: () => void;
}

export const useApiKeyStore = create<ApiKeyState>((set) => ({
  apiKey: null,
  isHydrated: false,

  setApiKey: (key: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, key);
    }
    set({ apiKey: key });
  },

  clearApiKey: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ apiKey: null });
  },

  hydrateApiKeyFromStorage: () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      set({ apiKey: stored || null, isHydrated: true });
    }
  },
}));

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}
