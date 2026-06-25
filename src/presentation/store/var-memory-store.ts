"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type VarMemoryState = {
  varMemory: Record<string, Record<string, string>>;
  setVar: (templateId: string, varName: string, value: string) => void;
  clearTemplate: (templateId: string) => void;
};

export const useVarMemoryStore = create<VarMemoryState>()(
  persist(
    (set) => ({
      varMemory: {},
      setVar: (templateId, varName, value) => {
        if (!value.trim()) return;
        set((state) => ({
          varMemory: {
            ...state.varMemory,
            [templateId]: {
              ...state.varMemory[templateId],
              [varName]: value,
            },
          },
        }));
      },
      clearTemplate: (templateId) => {
        set((state) => {
          const next = { ...state.varMemory };
          delete next[templateId];
          return { varMemory: next };
        });
      },
    }),
    { name: "post-generator-var-memory" },
  ),
);
