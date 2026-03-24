"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Search } from "lucide-react";

interface TickerSearchProps {
  className?: string;
  autoFocus?: boolean;
  size?: "default" | "lg";
}

export default function TickerSearch({
  className = "",
  autoFocus = false,
  size = "default",
}: TickerSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const canSubmit = value.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    router.push(`/dashboard/${ticker}`);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  const isLarge = size === "lg";

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2 ${className}`}
    >
      <div className="relative flex-1">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${isLarge ? "h-5 w-5" : "h-4 w-4"}`}
        />
        <input
          type="text"
          placeholder="Search ticker... (AAPL, MSFT, TSLA)"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          maxLength={10}
          className={`${isLarge ? "h-14 pl-11 pr-4 text-lg" : "h-10 pl-9 pr-4"} w-full rounded-lg border border-border/50 bg-card/60 text-foreground backdrop-blur-sm transition-colors outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50`}
        />
      </div>
      <button
        type="submit"
        aria-disabled={!canSubmit || undefined}
        className={`${isLarge ? "h-14 px-8 text-lg" : "h-10 px-4"} inline-flex shrink-0 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground transition-colors hover:bg-primary/90 ${!canSubmit ? "pointer-events-none opacity-50" : ""}`}
      >
        Analyze
      </button>
    </form>
  );
}
