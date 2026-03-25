"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Flame, Search } from "lucide-react";
import {
  SUPPORTED_COMMODITIES,
  getCommodityCategoryLabel,
  getCommodityMeta,
} from "@/lib/commodities";
import type { CommodityInstrumentSlug } from "@/types/api";

interface CommoditySearchProps {
  className?: string;
  autoFocus?: boolean;
  size?: "default" | "lg";
  variant?: "default" | "hero" | "dashboard";
}

export default function CommoditySearch({
  className = "",
  autoFocus = false,
  size = "default",
  variant = "default",
}: CommoditySearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);

  const isLarge = size === "lg";
  const isHero = variant === "hero";
  const isDashboard = variant === "dashboard";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = (() => {
    const query = value.trim().toLowerCase();
    if (!query) {
      return SUPPORTED_COMMODITIES;
    }

    return SUPPORTED_COMMODITIES.filter((item) => {
      return (
        item.instrument.includes(query) ||
        item.short_label.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.category.includes(query)
      );
    });
  })();

  function navigate(instrument: CommodityInstrumentSlug) {
    setValue(instrument);
    setOpen(false);
    router.push(`/commodities/${instrument}`);
  }

  function resolveTypedInstrument(): CommodityInstrumentSlug | null {
    const normalized = value.trim().toLowerCase();
    const exact = SUPPORTED_COMMODITIES.find(
      (item) =>
        item.instrument === normalized ||
        item.short_label.toLowerCase() === normalized ||
        item.name.toLowerCase() === normalized,
    );

    return exact?.instrument ?? results[0]?.instrument ?? null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${isHero || isDashboard ? "z-20" : ""} ${className}`}
    >
      <div className={isHero ? "flex items-center gap-3" : "flex items-center gap-2"}>
        <div className="relative flex-1">
          <Search
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
              isHero || isDashboard ? "text-black/34" : "text-muted-foreground"
            } ${isHero ? "left-4 h-5 w-5" : isDashboard ? "left-3.5 h-4.5 w-4.5" : isLarge ? "left-3 h-5 w-5" : "left-3 h-4 w-4"}`}
          />
          <input
            type="text"
            placeholder="Search commodities... (Gold, WTI Crude Oil, Wheat)"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSelected(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open || results.length === 0) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const instrument = resolveTypedInstrument();
                  if (instrument) {
                    navigate(instrument);
                  }
                }
                return;
              }

              switch (e.key) {
                case "ArrowDown":
                  e.preventDefault();
                  setSelected((prev) => (prev + 1) % results.length);
                  break;
                case "ArrowUp":
                  e.preventDefault();
                  setSelected((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
                  break;
                case "Enter":
                  e.preventDefault();
                  navigate(
                    selected >= 0 && selected < results.length
                      ? results[selected].instrument
                      : results[0].instrument,
                  );
                  break;
                case "Escape":
                  setOpen(false);
                  break;
              }
            }}
            autoFocus={autoFocus}
            autoComplete="off"
            className={`w-full transition-colors outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50 ${
              isHero
                ? "h-10 rounded-[10px] border border-black/[0.08] bg-[#f4f8ff] pl-12 pr-5 text-sm text-[#161616] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                : isDashboard
                  ? "h-10 rounded-[10px] border border-black/[0.08] bg-[#f4f8ff] pl-11 pr-4 text-sm text-[#161616] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                  : isLarge
                    ? "h-14 rounded-lg border border-border/50 bg-card/60 pl-11 pr-4 text-lg text-foreground backdrop-blur-sm"
                    : "h-10 rounded-lg border border-border/50 bg-card/60 pl-9 pr-4 text-sm text-foreground backdrop-blur-sm"
            }`}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            const instrument = resolveTypedInstrument();
            if (instrument) {
              navigate(instrument);
            }
          }}
          aria-disabled={!results.length || undefined}
          className={`inline-flex shrink-0 items-center justify-center font-medium transition-colors ${
            isHero
              ? "h-10 rounded-[10px] bg-[#1080ff] px-5 text-sm text-white shadow-none hover:bg-[#006fe6]"
              : isDashboard
                ? "h-10 rounded-[10px] bg-[#1080ff] px-4 text-sm text-white hover:bg-[#006fe6]"
                : isLarge
                  ? "h-14 rounded-lg bg-primary px-8 text-lg text-primary-foreground hover:bg-primary/90"
                  : "h-10 rounded-lg bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
          } ${!results.length ? "pointer-events-none opacity-50" : ""}`}
        >
          Open
        </button>
      </div>

      {open && results.length > 0 ? (
        <ul
          role="listbox"
          className={`overflow-y-auto overflow-x-hidden border shadow-lg ${
            isHero
              ? "relative mt-3 max-h-[22rem] rounded-[14px] border-black/[0.08] bg-white"
              : isDashboard
                ? "absolute top-full left-0 z-50 mt-2 max-h-[22rem] w-full rounded-[14px] border-black/[0.08] bg-white"
                : "absolute top-full left-0 z-50 mt-1 max-h-[22rem] w-full rounded-lg border-border/50 bg-popover backdrop-blur-sm"
          }`}
        >
          {results.map((item, index) => (
            <li
              key={item.instrument}
              role="option"
              aria-selected={index === selected}
              onMouseDown={(e) => {
                e.preventDefault();
                navigate(item.instrument);
              }}
              onMouseEnter={() => setSelected(index)}
              className={`flex cursor-pointer items-center gap-3 text-sm transition-colors ${
                isHero ? "px-4 py-3" : isDashboard ? "px-3.5 py-3" : "px-3 py-2.5"
              } ${
                index === selected
                  ? isHero || isDashboard
                    ? "bg-[#eef5ff] text-[#161616]"
                    : "bg-muted text-foreground"
                  : isHero || isDashboard
                    ? "text-black/58 hover:bg-[#f6f9ff]"
                    : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef5ff] text-[#1080ff]">
                {getCommodityMeta(item.instrument).logoSrc ? (
                  <Image
                    src={getCommodityMeta(item.instrument).logoSrc!}
                    alt={`${item.name} logo`}
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px] object-cover"
                  />
                ) : (
                  <Flame className="h-3.5 w-3.5" />
                )}
              </div>
              <span className="font-medium text-foreground">{item.short_label}</span>
              <span className="truncate">{item.name}</span>
              <span className="ml-auto text-xs text-black/42">
                {getCommodityCategoryLabel(item.category)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
