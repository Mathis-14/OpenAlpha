"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  Coins,
  FileSearch,
  Globe,
  Search,
} from "lucide-react";
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

  const toolsAnimationDelay =
    showAgent || showBrowse ? "360ms" : "3050ms";

  const toolsSection = (
    <div
      className="w-full max-w-[920px] animate-[fadeSlideUp_0.75s_ease-out_both]"
      style={{ animationDelay: toolsAnimationDelay }}
    >
      <div className="rounded-[1.5rem] border border-black/[0.08] bg-white p-5 text-left shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] sm:p-6">
        <div className="mb-4 space-y-1">
          <p className="text-sm font-medium text-[#161616]">Tools</p>
          <p className="text-sm font-light text-black/62">
            Open a dedicated browsing surface directly.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setShowBrowse(true)}
            className="flex items-start gap-3 rounded-[1.15rem] border border-black/[0.08] bg-[#f4f8ff] p-4 text-left transition-colors hover:bg-[#e9f3ff]"
          >
            <div className="mt-0.5 rounded-full bg-white p-2 text-[#1080ff]">
              <Search className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">
                Browse stocks
              </p>
              <p className="text-sm font-light leading-6 text-black/62">
                Open an equity workspace directly.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-start gap-3 rounded-[1.15rem] border border-black/[0.08] bg-[#fbfbfa] p-4 text-left opacity-80"
          >
            <div className="mt-0.5 rounded-full bg-white p-2 text-black/46">
              <Globe className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[#161616]">
                  Browse macro
                </p>
                <span className="rounded-full border border-black/[0.08] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-black/42">
                  Soon
                </span>
              </div>
              <p className="text-sm font-light leading-6 text-black/62">
                Explore rates, inflation, and growth data.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-start gap-3 rounded-[1.15rem] border border-black/[0.08] bg-[#fbfbfa] p-4 text-left opacity-80"
          >
            <div className="mt-0.5 rounded-full bg-white p-2 text-black/46">
              <Coins className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[#161616]">
                  Browse crypto
                </p>
                <span className="rounded-full border border-black/[0.08] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-black/42">
                  Soon
                </span>
              </div>
              <p className="text-sm font-light leading-6 text-black/62">
                Review major crypto assets and market structure.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />

      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] flex-col items-center px-6 py-10 text-center lg:px-8 lg:py-14">
        <section className="flex w-full max-w-[1040px] flex-col items-center gap-6">
          <div
            className="animate-[fadeSlideUp_0.65s_ease-out_both] text-sm font-normal text-black/58"
            style={{ animationDelay: "2200ms" }}
          >
            Open-source financial intelligence
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="relative flex justify-center">
              <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-full bg-[#1080ff]/8 blur-3xl animate-[heroLogoGlow_3.2s_cubic-bezier(0.19,1,0.22,1)_both]" />
              <Image
                src="/openalpha_logo_light.svg"
                alt="OpenAlpha"
                width={880}
                height={250}
                priority
                className="relative h-auto w-full max-w-[420px] animate-[heroLogoReveal_3.1s_cubic-bezier(0.19,1,0.22,1)_both]"
              />
            </div>

            <div
              className="max-w-[600px] animate-[fadeSlideUp_0.7s_ease-out_both]"
              style={{ animationDelay: "2400ms" }}
            >
              <p className="text-lg leading-8 font-light text-black/82 sm:text-[1.36rem] sm:leading-9">
                See the data. Understand the market.
              </p>
            </div>
          </div>

          <div className="w-full max-w-[1020px]">
            {showAgent ? (
              <div
                ref={agentShellRef}
                className="animate-[fadeSlideUp_0.75s_ease-out_both]"
                style={{ animationDelay: "2850ms" }}
              >
                <AgentChat variant="landing" />
              </div>
            ) : (
              <div
                className="animate-[fadeSlideUp_0.75s_ease-out_both] rounded-[1.75rem] border border-black/[0.08] bg-white px-6 py-6 text-left shadow-[0_30px_60px_-38px_rgba(0,0,0,0.1)] sm:px-7"
                style={{ animationDelay: "2850ms" }}
              >
                  <div className="flex flex-col gap-4">
                    <div className="space-y-1.5">
                      <h2 className="text-2xl font-medium tracking-tight text-[#161616] sm:text-[1.8rem]">
                        Start with the agent
                      </h2>
                      <p className="text-sm leading-7 font-light text-black/70 sm:text-[15px] sm:whitespace-nowrap">
                        Ask a market question, compare companies, or explore macro trends with Alpha.
                      </p>
                    </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        shouldScrollToAgentRef.current = true;
                        setShowAgent(true);
                        setShowBrowse(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1080ff] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]"
                    >
                      Ask Alpha
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!showAgent && !showBrowse && toolsSection}

          {showBrowse && (
            <div
              className="w-full max-w-[920px] animate-[fadeSlideUp_0.75s_ease-out_both]"
              style={{ animationDelay: showAgent ? "150ms" : "80ms" }}
            >
              <div className="rounded-[1.75rem] border border-black/[0.08] bg-white p-5 text-left shadow-[0_30px_60px_-38px_rgba(0,0,0,0.1)] sm:p-6">
                <div className="mb-4 space-y-1 text-center">
                  <p className="text-[11px] font-normal uppercase tracking-[0.22em] text-black/52">
                    Browse Directly
                  </p>
                  <h2 className="text-xl font-medium tracking-tight text-[#161616]">
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
                  className="group rounded-[1.35rem] border border-black/[0.08] bg-white p-5 text-left shadow-[0_20px_46px_-42px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-black/[0.12] hover:bg-[#fcfbf9]"
                >
                  <div className="mb-4 inline-flex rounded-[1rem] border border-black/[0.08] bg-[#f7f6f2] p-3 text-black/64">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-medium text-[#161616]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 font-light text-black/64">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </section>
        )}

        <footer className="mt-10 flex w-full max-w-[1200px] flex-col gap-3 border-t border-black/[0.08] pt-5 text-sm text-black/52 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-light">
            OpenAlpha combines prices, fundamentals, filings, macro indicators,
            and a Mistral-powered agent.
          </p>
          <a
            href="https://github.com/Mathis-14/OpenAlpha"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-black"
          >
            View on GitHub
          </a>
        </footer>
      </main>
    </div>
  );
}
