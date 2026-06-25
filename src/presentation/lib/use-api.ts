"use client";

import * as React from "react";

type UseApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  isRefetching: boolean;
};

export function useApi<T>(
  fetcher: () => Promise<T>,
): UseApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = React.useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: true,
    isRefetching: false,
  });
  const mountedRef = React.useRef(true);
  // Monotonic request id: only the most recently started load may commit its
  // result, so a slow earlier fetch can't overwrite a newer one (search/offset
  // changing rapidly).
  const latestRequestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setState((s) => ({
      ...s,
      loading: s.data === null,
      isRefetching: s.data !== null,
      error: null,
    }));
    try {
      const data = await fetcher();
      if (mountedRef.current && requestId === latestRequestRef.current) {
        setState({ data, error: null, loading: false, isRefetching: false });
      }
    } catch (err) {
      if (mountedRef.current && requestId === latestRequestRef.current) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : "加载失败",
          loading: false,
          isRefetching: false,
        }));
      }
    }
  }, [fetcher]);

  React.useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { ...state, refetch: load };
}
