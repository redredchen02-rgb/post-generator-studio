"use client";

import { create } from "zustand";
import type { BootstrapData } from "@/presentation/lib/api";
import { loadBootstrap } from "@/presentation/lib/api";

const STALE_MS = 30_000; // 30 seconds

type BootstrapState = {
  data: BootstrapData | null;
  loadedAt: number;
  loading: boolean;
  error: string | null;

  /** Fetch if stale or not loaded — SWR pattern */
  fetchIfNeeded: () => Promise<void>;
  /** Force refetch */
  refetch: () => Promise<void>;
};

export const useBootstrapStore = create<BootstrapState>()((set, get) => ({
  data: null,
  loadedAt: 0,
  loading: false,
  error: null,

  fetchIfNeeded: async () => {
    const state = get();
    const isStale = Date.now() - state.loadedAt > STALE_MS;
    if (state.data && !isStale) return; // Fresh enough
    if (state.loading) return; // Already fetching

    set({ loading: true, error: null });
    try {
      const data = await loadBootstrap();
      set({ data, loadedAt: Date.now(), loading: false, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load bootstrap",
        loading: false,
      });
    }
  },

  refetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await loadBootstrap();
      set({ data, loadedAt: Date.now(), loading: false, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load bootstrap",
        loading: false,
      });
    }
  },
}));