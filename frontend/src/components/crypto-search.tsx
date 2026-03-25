"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { SUPPORTED_CRYPTO_MARKETS } from "@/lib/crypto";
import type { CryptoInstrument } from "@/types/api";

interface CryptoSearchProps {
  className?: string;
  autoFocus?: boolean;
  size?: "default" | "lg";
  variant?: "default" | "hero" | "dashboard";
}

export default function CryptoSearch({
  className = "",
  autoFocus = false,
  size = "default",
  variant = "default",
}: CryptoSearchProps) {
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
      return SUPPORTED_CRYPTO_MARKETS;
    }

    return SUPPORTED_CRYPTO_MARKETS.filter((item) => {
      const instrument = item.instrument.toLowerCase();
      const symbol = item.symbol.toLowerCase();
      const name = item.name.toLowerCase();
      return (
        instrument.includes(query) ||
        symbol.includes(query) ||
        name.includes(query)
      );
    });
  })();

  function navigate(instrument: CryptoInstrument) {
    setValue(instrument);
    setOpen(false);
    router.push(`/crypto/${instrument}`);
  }

  function resolveTypedInstrument(): CryptoInstrument | null {
    const normalized = value.trim().toUpperCase();
    const exact = SUPPORTED_CRYPTO_MARKETS.find(
      (item) =>
        item.instrument === normalized ||
        item.symbol === normalized ||
        item.name.toUpperCase() === normalized,
    );

    return exact?.instrument ?? results[0]?.instrument ?? null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${isHero || isDashboard ? "z-20" : ""} ${className}`}
    >
      <div
        className={isHero ? "flex items-center gap-3" : "flex items-center gap-2"}
      >
        <div className="relative flex-1">
          <Search
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
              isHero || isDashboard ? "text-black/34" : "text-muted-foreground"
            } ${isHero ? "left-4 h-5 w-5" : isDashboard ? "left-3.5 h-4.5 w-4.5" : isLarge ? "left-3 h-5 w-5" : "left-3 h-4 w-4"}`}
          />
          <input
            type="text"
            placeholder="Search crypto market... (BTC, ETH)"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase());
              setSelected(-1);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
            }}
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
          className={`overflow-hidden border shadow-lg ${
            isHero
              ? "relative mt-3 max-h-[22rem] rounded-[14px] border-black/[0.08] bg-white"
              : isDashboard
                ? "absolute top-full left-0 z-50 mt-2 w-full rounded-[14px] border-black/[0.08] bg-white"
                : "absolute top-full left-0 z-50 mt-1 w-full rounded-lg border-border/50 bg-popover backdrop-blur-sm"
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
              <Image
                src={item.logoSrc}
                alt={`${item.name} logo`}
                width={18}
                height={18}
                className="h-[18px] w-[18px] shrink-0"
              />
              <span className="font-mono font-semibold text-foreground">
                {item.symbol}
              </span>
              <span className="truncate">{item.name} perpetual</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
