"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface AgentAlphaIconProps {
  className?: string;
  tone?: "default" | "light";
}

export default function AgentAlphaIcon({
  className = "",
  tone = "default",
}: AgentAlphaIconProps) {
  return (
    <Image
      src={tone === "light" ? "/openalpha_alpha_light.svg" : "/openalpha_alpha.svg"}
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
