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
  refresh: () => Promise<void>;
  setRemaining: (remaining: number) => void;
};

const UsageQuotaContext = createContext<UsageQuotaContextValue | null>(null);

const DEFAULT_LIMIT = 20;

export function UsageQuotaProvider({ children }: { children: ReactNode }) {
  const [quota, setQuota] = useState<UsageQuota | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextQuota = await getUsageQuota();
      setQuota(nextQuota);
    } catch {
      setQuota((prev) => prev ?? { limit: DEFAULT_LIMIT, remaining: DEFAULT_LIMIT });
    } finally {
      setLoading(false);
    }
  }, []);

  const setRemaining = useCallback((remaining: number) => {
    setQuota((prev) => ({
      limit: prev?.limit ?? DEFAULT_LIMIT,
      remaining: Math.max(0, Math.trunc(remaining)),
    }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      quota,
      loading,
      refresh,
      setRemaining,
    }),
    [quota, loading, refresh, setRemaining],
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
