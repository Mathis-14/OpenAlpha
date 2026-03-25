"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Search } from "lucide-react";
import { MACRO_COUNTRY_OPTIONS } from "@/lib/data-export";
import type { MacroCountry } from "@/types/api";

interface MacroSearchProps {
  className?: string;
  autoFocus?: boolean;
  size?: "default" | "lg";
  variant?: "default" | "hero" | "dashboard";
}

type MacroCountryOption = {
  value: MacroCountry;
  label: string;
  aliases: string[];
};

const COUNTRY_OPTIONS: MacroCountryOption[] = MACRO_COUNTRY_OPTIONS.map((item) => ({
  ...item,
  aliases:
    item.value === "us"
      ? ["us", "u.s.", "united states", "america"]
      : ["fr", "france", "french"],
}));

export default function MacroSearch({
  className = "",
  autoFocus = false,
  size = "default",
  variant = "default",
}: MacroSearchProps) {
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

  const results = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) {
      return COUNTRY_OPTIONS;
    }

    return COUNTRY_OPTIONS.filter((item) => {
      return (
        item.label.toLowerCase().includes(query) ||
        item.aliases.some((alias) => alias.includes(query))
      );
    });
  }, [value]);

  function navigate(country: MacroCountry) {
    setValue(COUNTRY_OPTIONS.find((item) => item.value === country)?.label ?? "");
    setOpen(false);
    router.push(country === "fr" ? "/macro?country=fr" : "/macro");
  }

  function resolveTypedCountry(): MacroCountry | null {
    const normalized = value.trim().toLowerCase();
    const exact = COUNTRY_OPTIONS.find(
      (item) =>
        item.value === normalized ||
        item.label.toLowerCase() === normalized ||
        item.aliases.includes(normalized),
    );

    return exact?.value ?? results[0]?.value ?? null;
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
            placeholder="Choose country... (United States, France)"
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
                  const country = resolveTypedCountry();
                  if (country) {
                    navigate(country);
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
                      ? results[selected].value
                      : results[0].value,
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
            const country = resolveTypedCountry();
            if (country) {
              navigate(country);
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
              ? "relative mt-3 rounded-[14px] border-black/[0.08] bg-white"
              : isDashboard
                ? "absolute top-full left-0 z-50 mt-2 w-full rounded-[14px] border-black/[0.08] bg-white"
                : "absolute top-full left-0 z-50 mt-1 w-full rounded-lg border-border/50 bg-popover backdrop-blur-sm"
          }`}
        >
          {results.map((item, index) => (
            <li
              key={item.value}
              role="option"
              aria-selected={index === selected}
              onMouseDown={(e) => {
                e.preventDefault();
                navigate(item.value);
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
              <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#eef5ff] text-[#1080ff]">
                <Globe className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium text-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
