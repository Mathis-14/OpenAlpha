"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface QuantAlphaIconProps {
  className?: string;
}

export default function QuantAlphaIcon({
  className = "",
}: QuantAlphaIconProps) {
  return (
    <Image
      src="/quant_alpha_logo_v5.svg"
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
