"use client";

import { useEffect, useState } from "react";
import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsageQuota } from "@/components/usage-quota-provider";

export default function RequestQuotaBadge({
  className,
}: {
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { quota, loading, unavailable } = useUsageQuota();

  useEffect(() => {
    setMounted(true);
  }, []);

  const baseClassName =
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-black/[0.08] bg-white/92 px-3.5 text-sm shadow-[0_16px_30px_-24px_rgba(0,0,0,0.14)] backdrop-blur-sm";

  if (!mounted) {
    return (
      <div
        className={cn(
          baseClassName,
          "text-black/52",
          className,
        )}
      >
        <BrainCircuit className="h-4 w-4" />
        <span className="font-medium whitespace-nowrap">Loading requests...</span>
      </div>
    );
  }

  const remaining = quota?.remaining;
  const text =
    loading
      ? "Loading requests..."
      : unavailable
        ? "Requests unavailable"
        : remaining == null
          ? "Requests unavailable"
          : `${remaining} request${remaining === 1 ? "" : "s"} left`;

  return (
    <div
      className={cn(
        baseClassName,
        unavailable ? "text-black/52" : remaining === 0 ? "text-[#b93828]" : "text-[#161616]",
        className,
      )}
    >
      <BrainCircuit className="h-4 w-4" />
      <span className="font-medium whitespace-nowrap">{text}</span>
    </div>
  );
}
