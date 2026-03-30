"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getUsageQuota } from "@/lib/api";
import type { UsageQuota } from "@/types/api";

type UsageQuotaContextValue = {
  quota: UsageQuota | null;
  loading: boolean;
  unavailable: boolean;
  refresh: () => Promise<void>;
  setRemaining: (remaining: number) => void;
};

const UsageQuotaContext = createContext<UsageQuotaContextValue | null>(null);

const DEFAULT_LIMIT = 20;

export function UsageQuotaProvider({ children }: { children: ReactNode }) {
  const [quota, setQuota] = useState<UsageQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextQuota = await getUsageQuota();
      setQuota(nextQuota);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const setRemaining = useCallback((remaining: number) => {
    setQuota((prev) => ({
      limit: prev?.limit ?? DEFAULT_LIMIT,
      remaining: Math.max(0, Math.trunc(remaining)),
    }));
    setUnavailable(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      quota,
      loading,
      unavailable,
      refresh,
      setRemaining,
    }),
    [quota, loading, unavailable, refresh, setRemaining],
  );

  return (
    <UsageQuotaContext.Provider value={value}>
      {children}
    </UsageQuotaContext.Provider>
  );
}

export function useUsageQuota() {
  const context = useContext(UsageQuotaContext);
  if (!context) {
    throw new Error("useUsageQuota must be used within UsageQuotaProvider");
  }

  return context;
}
