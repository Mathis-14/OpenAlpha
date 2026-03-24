"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface AgentAlphaIconProps {
  className?: string;
}

export default function AgentAlphaIcon({
  className = "",
}: AgentAlphaIconProps) {
  return (
    <Image
      src="/openalpha_alpha.svg"
      alt=""
      aria-hidden="true"
      width={28}
      height={28}
      className={cn(
        "inline-block h-5 w-5 shrink-0 select-none",
        className,
      )}
    />
  );
}
