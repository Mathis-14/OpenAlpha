"use client";

import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsageQuota } from "@/components/usage-quota-provider";

export default function RequestQuotaBadge({
  className,
}: {
  className?: string;
}) {
  const { quota, loading } = useUsageQuota();
  const remaining = quota?.remaining;
  const text =
    loading || remaining == null
      ? "Loading requests..."
      : `${remaining} request${remaining === 1 ? "" : "s"} left`;

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-black/[0.08] bg-white/92 px-3.5 text-sm shadow-[0_16px_30px_-24px_rgba(0,0,0,0.14)] backdrop-blur-sm",
        remaining === 0 ? "text-[#b93828]" : "text-[#161616]",
        className,
      )}
    >
      <BrainCircuit className="h-4 w-4" />
      <span className="font-medium">{text}</span>
    </div>
  );
}
