"use client";

import * as React from "react";

type UseApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useApi<T>(fetcher: () => Promise<T>): UseApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = React.useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: true,
  });
  const mountedRef = React.useRef(true);

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcher();
      if (mountedRef.current) {
        setState({ data, error: null, loading: false });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState({
          data: null,
          error: err instanceof Error ? err.message : "加载失败",
          loading: false,
        });
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
