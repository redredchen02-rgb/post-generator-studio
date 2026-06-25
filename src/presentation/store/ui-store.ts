"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  rawMode: boolean;
  editorFontSize: number;
  setRawMode: (value: boolean) => void;
  setEditorFontSize: (value: number) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      rawMode: true,
      editorFontSize: 15,
      setRawMode: (value) => set({ rawMode: value }),
      setEditorFontSize: (value) => set({ editorFontSize: value }),
    }),
    {
      name: "post-generator-ui",
    },
  ),
);

