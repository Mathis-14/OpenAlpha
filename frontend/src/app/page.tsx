"use client";

import Image from "next/image";
import Aurora from "@/components/Aurora";
import ChartLines from "@/components/chart-lines";
import TickerSearch from "@/components/ticker-search";
import AgentChat from "@/components/dashboard/agent-chat";

const FEATURES = [
  {
    title: "Real-Time Market Data",
    description: "Live prices, fundamentals, and historical OHLCV data for any publicly traded stock.",
  },
  {
    title: "Macro Indicators",
    description: "Fed Funds rate, CPI, GDP growth, Treasury yields, and unemployment -- always current.",
  },
  {
    title: "SEC Filings",
    description: "Parsed 10-K and 10-Q reports with key sections: Risk Factors, MD&A, and more.",
  },
  {
    title: "AI-Powered Analysis",
    description: "A conversational agent that fetches data, crunches numbers, and explains what matters.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <Aurora
          colorStops={["#3C3489", "#9B93F5", "#534AB7"]}
          amplitude={1.2}
          blend={0.6}
          speed={0.4}
        />
      </div>

      {/* Full-width chart lines (same style as logo SVG) */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <ChartLines />
      </div>

      {/* Gradient overlay for readability */}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-background via-background/80 to-transparent" />

      {/* Content */}
      <main className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-8 px-6 py-24 text-center">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4">
          <span className="inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium tracking-widest text-primary uppercase">
            Open Source
          </span>

          <h1 className="animate-[fadeSlideUp_0.8s_ease-out_both]">
            <Image
              src="/openalpha_logo.svg"
              alt="OpenAlpha"
              width={680}
              height={200}
              className="h-auto w-[280px] sm:w-[340px]"
              priority
            />
          </h1>

          <p className="max-w-lg text-lg text-muted-foreground leading-relaxed">
            AI-powered financial intelligence. Analyze any stock with real-time
            data, macro indicators, SEC filings, and a conversational AI agent.
          </p>
        </div>

        {/* Search */}
        <div className="w-full max-w-xl">
          <TickerSearch size="lg" autoFocus />
        </div>

        {/* Agent chat */}
        <div className="w-full max-w-2xl text-left">
          <div className="h-[480px]">
            <AgentChat />
          </div>
        </div>

        {/* Feature grid */}
        <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border/40 bg-card/40 p-5 text-left backdrop-blur-sm transition-colors hover:border-primary/30 hover:bg-card/60"
            >
              <h3 className="text-sm font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="mt-4 text-xs text-muted-foreground/60">
          Built with FastAPI, Mistral AI, and Next.js.{" "}
          <a
            href="https://github.com/Mathis-14/OpenAlpha"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-primary"
          >
            View on GitHub
          </a>
        </p>
      </main>
    </div>
  );
}
