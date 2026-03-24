"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  FileSearch,
  Globe,
  Radar,
  Search,
} from "lucide-react";
import AgentAlphaIcon from "@/components/agent-alpha-icon";
import Aurora from "@/components/Aurora";
import ChartLines from "@/components/chart-lines";
import LandingSpotlight from "@/components/landing-spotlight";
import TickerSearch from "@/components/ticker-search";
import AgentChat from "@/components/dashboard/agent-chat";

const FEATURE_CARDS = [
  {
    title: "Live Market Data",
    description: "Real-time prices, fundamentals, and history for listed equities.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Macro Context",
    description: "Fed, CPI, GDP, Treasury yields, and unemployment in one place.",
    icon: Globe,
  },
  {
    title: "SEC Reading",
    description: "10-K and 10-Q sections surfaced without digging through filings.",
    icon: FileSearch,
  },
  {
    title: "Agent Reasoning",
    description: "A tool-using analyst that fetches the data before it answers.",
    icon: BrainCircuit,
  },
];

const GUIDELINES = [
  "Speak to the agent",
  "Browse directly by ticker",
  "Move into a stock dashboard when needed",
];

export default function LandingPage() {
  const [showAgent, setShowAgent] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const agentShellRef = useRef<HTMLDivElement>(null);
  const shouldScrollToAgentRef = useRef(false);

  useEffect(() => {
    if (!showAgent || !shouldScrollToAgentRef.current) {
      return;
    }

    shouldScrollToAgentRef.current = false;

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const shellTop = agentShellRef.current?.getBoundingClientRect().top;
        if (shellTop == null) {
          return;
        }

        window.scrollTo({
          top: window.scrollY + shellTop - 32,
          behavior: "smooth",
        });
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [showAgent]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-85">
        <Aurora
          colorStops={["#17265C", "#5366E7", "#8A7DFF"]}
          amplitude={1.08}
          blend={0.58}
          speed={0.34}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-[1] opacity-45">
        <ChartLines />
      </div>

      <LandingSpotlight />

      <div className="pointer-events-none absolute inset-0 z-[3] bg-[linear-gradient(180deg,rgba(6,8,18,0.08),rgba(6,8,18,0.58)_30%,rgba(6,8,18,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(6,8,18,0.12),rgba(6,8,18,0.52)_28%,rgba(6,8,18,0.94)_100%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col items-center px-6 py-10 text-center lg:px-8 lg:py-14">
        <section className="flex w-full max-w-[1080px] flex-col items-center gap-8">
          <div
            className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md animate-[fadeSlideUp_0.65s_ease-out_both]"
            style={{ animationDelay: "2200ms" }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-primary">
              <Radar className="h-3.5 w-3.5" />
              Open Source Financial Intelligence
            </span>
          </div>

          <div className="flex flex-col items-center gap-5">
            <div className="relative flex justify-center">
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl animate-[heroLogoGlow_3.6s_cubic-bezier(0.19,1,0.22,1)_both]" />
              <Image
                src="/openalpha_logo.svg"
                alt="OpenAlpha"
                width={880}
                height={250}
                priority
                className="relative h-auto w-[320px] animate-[heroLogoReveal_3.8s_cubic-bezier(0.19,1,0.22,1)_both] sm:w-[440px] lg:w-[620px]"
              />
            </div>

            <div
              className="max-w-3xl space-y-5 animate-[fadeSlideUp_0.7s_ease-out_both]"
              style={{ animationDelay: "2500ms" }}
            >
              <p className="text-lg leading-8 text-foreground/90 sm:text-[1.4rem]">
                Market intelligence with a cleaner workflow. Start with the
                agent, browse a stock directly, and step into a dedicated
                dashboard when the conversation becomes specific.
              </p>

              <div className="flex flex-wrap justify-center gap-2.5">
                {GUIDELINES.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-foreground/80 backdrop-blur-sm"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full max-w-[1020px]">
            {showAgent ? (
              <div
                ref={agentShellRef}
                className="animate-[fadeSlideUp_0.75s_ease-out_both]"
                style={{ animationDelay: "2850ms" }}
              >
                <div className="h-[640px] sm:h-[680px]">
                  <AgentChat variant="landing" />
                </div>
              </div>
            ) : (
              <div
                className="rounded-[2rem] border border-white/[0.12] bg-[linear-gradient(180deg,rgba(16,20,43,0.82),rgba(8,10,22,0.78))] px-6 py-6 text-left shadow-[0_48px_110px_-62px_rgba(83,74,183,0.9)] backdrop-blur-xl animate-[fadeSlideUp_0.75s_ease-out_both] sm:px-7"
                style={{ animationDelay: "2850ms" }}
              >
                <div className="flex flex-col gap-5">
                  <div className="space-y-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-primary/90 backdrop-blur-md">
                      <AgentAlphaIcon className="h-[1.45rem] w-[1.45rem]" />
                      Speak to Alpha
                    </span>
                    <div className="space-y-1.5">
                      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                        Start with the agent
                      </h2>
                      <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                        Ask a broad market question, compare stocks, or explore
                        a macro signal. Open the full chat when you are ready.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        shouldScrollToAgentRef.current = true;
                        setShowAgent(true);
                        setShowBrowse(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-[0_18px_36px_-18px_rgba(83,74,183,0.9)] transition-colors hover:bg-primary/90"
                    >
                      Open Alpha
                      <ArrowRight className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowBrowse(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.05] px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-white/[0.08]"
                    >
                      Browse stocks
                      <Search className="h-4 w-4 text-primary/90" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {showBrowse && (
            <div
              className="w-full max-w-[920px] animate-[fadeSlideUp_0.75s_ease-out_both]"
              style={{ animationDelay: showAgent ? "150ms" : "80ms" }}
            >
              <div className="rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,20,43,0.76),rgba(9,11,23,0.84))] p-5 text-left shadow-[0_40px_120px_-64px_rgba(75,149,255,0.58)] backdrop-blur-xl sm:p-6">
                <div className="mb-4 space-y-1 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary/90">
                    Browse Directly
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    Open a stock workspace in one move
                  </h2>
                </div>
                <TickerSearch
                  size="lg"
                  variant="hero"
                  autoFocus={!showAgent}
                />
              </div>
            </div>
          )}
        </section>

        {(showAgent || showBrowse) && (
          <section
            className="mt-12 grid w-full max-w-[1200px] gap-4 md:grid-cols-2 xl:grid-cols-4 animate-[fadeSlideUp_0.75s_ease-out_both]"
            style={{ animationDelay: showAgent ? "260ms" : "160ms" }}
          >
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="group rounded-[1.5rem] border border-white/[0.08] bg-card/40 p-5 text-left shadow-[0_24px_70px_-48px_rgba(75,149,255,0.45)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/55"
                >
                  <div className="mb-4 inline-flex rounded-2xl border border-primary/15 bg-primary/10 p-3 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </section>
        )}

        <footer className="mt-10 flex w-full max-w-[1200px] flex-col gap-3 border-t border-white/[0.08] pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            OpenAlpha combines prices, fundamentals, filings, macro indicators,
            and a Mistral-powered agent.
          </p>
          <a
            href="https://github.com/Mathis-14/OpenAlpha"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-primary"
          >
            View on GitHub
          </a>
        </footer>
      </main>
    </div>
  );
}
