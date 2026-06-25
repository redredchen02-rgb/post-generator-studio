"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Locale = "en" | "zh-CN";

type UiState = {
  rawMode: boolean;
  editorFontSize: number;
  darkMode: boolean;
  locale: Locale;
  setRawMode: (value: boolean) => void;
  setEditorFontSize: (value: number) => void;
  setDarkMode: (value: boolean) => void;
  setLocale: (value: Locale) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      rawMode: true,
      editorFontSize: 15,
      darkMode: false,
      locale: "en",
      setRawMode: (value) => set({ rawMode: value }),
      setEditorFontSize: (value) => set({ editorFontSize: value }),
      setDarkMode: (value) => set({ darkMode: value }),
      setLocale: (value) => set({ locale: value }),
    }),
    {
      name: "post-generator-ui",
    },
  ),
);

