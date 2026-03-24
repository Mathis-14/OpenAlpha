"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import TICKERS, { type TickerEntry } from "@/data/tickers";
import { searchTickers } from "@/lib/api";

interface TickerSearchProps {
  className?: string;
  autoFocus?: boolean;
  size?: "default" | "lg";
}

const MAX_RESULTS = 8;
const DEBOUNCE_MS = 300;

function filterLocal(query: string): TickerEntry[] {
  const q = query.toLowerCase();
  return TICKERS.filter(
    (t) =>
      t.symbol.toLowerCase().startsWith(q) ||
      t.name.toLowerCase().includes(q),
  ).slice(0, MAX_RESULTS);
}

export default function TickerSearch({
  className = "",
  autoFocus = false,
  size = "default",
}: TickerSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<TickerEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLarge = size === "lg";

  const navigate = useCallback(
    (ticker: string) => {
      const sym = ticker.trim().toUpperCase();
      if (!sym) return;
      setValue(sym);
      setOpen(false);
      router.push(`/dashboard/${sym}`);
    },
    [router],
  );

  const handleInputChange = useCallback((raw: string) => {
    const upper = raw.toUpperCase();
    setValue(upper);

    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const q = upper.trim();
    if (q.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }

    const local = filterLocal(q);
    setResults(local);
    setOpen(true);
    setSelected(-1);

    if (local.length >= MAX_RESULTS) return;

    const controller = new AbortController();
    abortRef.current = controller;

    timerRef.current = setTimeout(async () => {
      try {
        const remote = await searchTickers(q, controller.signal);
        const localSymbols = new Set(local.map((t) => t.symbol));
        const merged = [
          ...local,
          ...remote
            .filter((r) => !localSymbols.has(r.symbol))
            .slice(0, MAX_RESULTS - local.length),
        ];
        if (!controller.signal.aborted) {
          setResults(merged);
        }
      } catch {
        /* ignore */
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigate(value);
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
        if (selected >= 0 && selected < results.length) {
          navigate(results[selected].symbol);
        } else {
          navigate(value);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${isLarge ? "h-5 w-5" : "h-4 w-4"}`}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search ticker or company... (AAPL, Apple)"
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (value.trim() && results.length > 0) setOpen(true);
            }}
            autoFocus={autoFocus}
            maxLength={40}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="ticker-listbox"
            className={`${isLarge ? "h-14 pl-11 pr-4 text-lg" : "h-10 pl-9 pr-4"} w-full rounded-lg border border-border/50 bg-card/60 text-foreground backdrop-blur-sm transition-colors outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50`}
          />
        </div>
        <button
          type="button"
          onClick={() => navigate(value)}
          aria-disabled={!value.trim() || undefined}
          className={`${isLarge ? "h-14 px-8 text-lg" : "h-10 px-4"} inline-flex shrink-0 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground transition-colors hover:bg-primary/90 ${!value.trim() ? "pointer-events-none opacity-50" : ""}`}
        >
          Analyze
        </button>
      </div>

      {open && results.length > 0 && (
        <ul
          id="ticker-listbox"
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-border/50 bg-popover shadow-lg backdrop-blur-sm"
        >
          {results.map((item, i) => (
            <li
              key={item.symbol}
              role="option"
              aria-selected={i === selected}
              onMouseDown={(e) => {
                e.preventDefault();
                navigate(item.symbol);
              }}
              onMouseEnter={() => setSelected(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                i === selected
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <TrendingUp className="h-4 w-4 shrink-0 text-primary/60" />
              <span className="font-mono font-semibold text-foreground">
                {item.symbol}
              </span>
              <span className="truncate">{item.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
