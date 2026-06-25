"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  rawMode: boolean;
  editorFontSize: number;
  darkMode: boolean;
  setRawMode: (value: boolean) => void;
  setEditorFontSize: (value: number) => void;
  setDarkMode: (value: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      rawMode: true,
      editorFontSize: 15,
      darkMode: false,
      setRawMode: (value) => set({ rawMode: value }),
      setEditorFontSize: (value) => set({ editorFontSize: value }),
      setDarkMode: (value) => set({ darkMode: value }),
    }),
    {
      name: "post-generator-ui",
    },
  ),
);

