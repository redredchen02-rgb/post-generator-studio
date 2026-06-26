"use client";

import { create } from "zustand";
import type { BootstrapData } from "@/presentation/lib/api";
import { loadBootstrap } from "@/presentation/lib/api";

const STALE_MS = 30_000; // 30 seconds
const RETRY_DELAY_MS = 500; // one automatic retry to self-heal a transient miss

type BootstrapState = {
  data: BootstrapData | null;
  loadedAt: number;
  loading: boolean;
  error: string | null;

  /** Fetch if stale or not loaded — SWR pattern */
  fetchIfNeeded: () => Promise<void>;
  /** Force refetch */
  refetch: () => Promise<void>;
  /** Mark data stale so the next fetchIfNeeded refetches (e.g. after a settings mutation) */
  invalidate: () => void;
};

/**
 * Load bootstrap with a single automatic retry. The first paint can hit a server
 * that is still warming up (or a momentary network blip); one retry turns that
 * transient miss into a successful load instead of a dead-end "Failed to load"
 * screen the user has to manually retry.
 */
async function loadWithRetry(): Promise<BootstrapData> {
  try {
    return await loadBootstrap();
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      return await loadBootstrap();
    } catch {
      throw first; // surface the original error reason
    }
  }
}

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
      const data = await loadWithRetry();
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
      const data = await loadWithRetry();
      set({ data, loadedAt: Date.now(), loading: false, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load bootstrap",
        loading: false,
      });
    }
  },

  invalidate: () => set({ loadedAt: 0 }),
}));