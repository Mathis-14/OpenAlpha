"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

  const navigate = useCallback(() => {
    const ticker = value.trim().toUpperCase();
    if (ticker) {
      router.push(`/dashboard/${ticker}`);
    }
  }, [value, router]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigate();
    }
  };

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
        <Input
          type="text"
          placeholder="Search ticker... (AAPL, MSFT, TSLA)"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          className={`${isLarge ? "h-14 pl-11 pr-4 text-lg" : "h-10 pl-9 pr-4"} bg-card/60 border-border/50 backdrop-blur-sm placeholder:text-muted-foreground/60 focus-visible:ring-primary/50`}
          maxLength={10}
        />
      </div>
      <Button
        type="submit"
        disabled={!value.trim()}
        className={`${isLarge ? "h-14 px-8 text-lg" : "h-10 px-4"} bg-primary text-primary-foreground hover:bg-primary/90`}
      >
        Analyze
      </Button>
    </form>
  );
}
