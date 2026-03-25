"use client";

import Link from "next/link";
import { useState } from "react";
import type { CommodityDiscoveryItem, CommodityInstrumentSlug } from "@/types/api";

const COLLAPSED_COUNT = 8;

export default function CommodityNav({
  currentInstrument,
  instruments,
}: {
  currentInstrument: CommodityInstrumentSlug;
  instruments: CommodityDiscoveryItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const primaryInstruments = instruments.slice(0, COLLAPSED_COUNT);
  const overflowInstruments = instruments.slice(COLLAPSED_COUNT);
  const hasOverflow = instruments.length > COLLAPSED_COUNT;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-nowrap items-center gap-2 overflow-hidden">
        {primaryInstruments.map((option) => (
          <Link
            key={option.instrument}
            href={`/commodities/${option.instrument}`}
            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
              option.instrument === currentInstrument
                ? "bg-[#1080ff] text-white"
                : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
            }`}
          >
            {option.short_label}
          </Link>
        ))}

        {hasOverflow && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-3.5 text-sm text-black/62 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
          >
            More...
          </button>
        )}
      </div>

      {hasOverflow && expanded && (
        <div className="flex flex-wrap items-center gap-2">
          {overflowInstruments.map((option) => (
            <Link
              key={option.instrument}
              href={`/commodities/${option.instrument}`}
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                option.instrument === currentInstrument
                  ? "bg-[#1080ff] text-white"
                  : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
              }`}
            >
              {option.short_label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-3.5 text-sm text-black/62 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
          >
            Less
          </button>
        </div>
      )}
    </div>
  );
}
