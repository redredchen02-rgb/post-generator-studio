"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ProviderState = {
  selectedProfileId: string | null;
  setSelectedProfile: (id: string) => void;
  clearSelectedProfile: () => void;
};

export const useProviderStore = create<ProviderState>()(
  persist(
    (set) => ({
      selectedProfileId: null,
      setSelectedProfile: (id) => set({ selectedProfileId: id }),
      clearSelectedProfile: () => set({ selectedProfileId: null }),
    }),
    { name: "post-generator-provider" },
  ),
);
