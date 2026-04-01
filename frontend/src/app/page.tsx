"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  Coins,
  Database,
  FileSearch,
  Globe,
  LogIn,
  PackageSearch,
  Search,
} from "lucide-react";
import LandingSpotlight from "@/components/landing-spotlight";
import TickerSearch from "@/components/ticker-search";
import CommoditySearch from "@/components/commodity-search";
import CryptoSearch from "@/components/crypto-search";
import MacroSearch from "@/components/macro-search";
import AgentChat from "@/components/dashboard/agent-chat";
import QuantAlphaIcon from "@/components/quant-alpha-icon";
import RequestQuotaBadge from "@/components/request-quota-badge";

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
  const router = useRouter();
  const [showAgent, setShowAgent] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const [browseMode, setBrowseMode] = useState<"stocks" | "commodities" | "macro" | "crypto">("stocks");
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

  const assetClassesSection = (
    <div
      className="w-full max-w-[920px] animate-[fadeSlideUp_0.75s_ease-out_both]"
      style={{ animationDelay: toolsAnimationDelay }}
    >
      <div className="rounded-[16px] border border-black/[0.08] bg-white p-4 text-left shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] sm:p-5">
        <div className="mb-3 space-y-1">
          <p className="text-sm font-medium text-[#161616]">Asset Classes</p>
          <p className="text-sm font-light text-black/62">
            Open a dedicated browsing surface directly.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setBrowseMode("stocks");
              setShowBrowse(true);
            }}
            className="flex h-full items-start gap-3 rounded-[14px] border border-[#1080ff]/18 bg-white p-3.5 text-left transition-colors hover:bg-[#f7fbff]"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#eef5ff] p-2 text-[#1080ff]">
              <Search className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">
                Stocks
              </p>
              <p className="text-xs font-light leading-5 text-black/62">
                Equity dashboards.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setBrowseMode("commodities");
              setShowBrowse(true);
            }}
            className="flex h-full items-start gap-3 rounded-[14px] border border-black/[0.08] bg-white p-3.5 text-left transition-colors hover:bg-[#f7fbff]"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#eef5ff] p-2 text-[#1080ff]">
              <PackageSearch className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">
                Commodities
              </p>
              <p className="text-xs font-light leading-5 text-black/62">
                Metals, energy, crops.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setBrowseMode("macro");
              setShowBrowse(true);
            }}
            className="flex h-full items-start gap-3 rounded-[14px] border border-black/[0.08] bg-white p-3.5 text-left transition-colors hover:bg-[#f7fbff]"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#eef5ff] p-2 text-[#1080ff]">
              <Globe className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">
                Macro
              </p>
              <p className="whitespace-nowrap text-xs font-light leading-5 text-black/62">
                Rates, inflation, growth.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setBrowseMode("crypto");
              setShowBrowse(true);
            }}
            className="flex h-full items-start gap-3 rounded-[14px] border border-black/[0.08] bg-white p-3.5 text-left transition-colors hover:bg-[#f7fbff]"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#eef5ff] p-2 text-[#1080ff]">
              <Coins className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">
                Crypto
              </p>
              <p className="text-xs font-light leading-5 text-black/62">
                BTC, ETH, more soon.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  const toolsSection = (
    <div
      className="w-full max-w-[920px] animate-[fadeSlideUp_0.75s_ease-out_both]"
      style={{ animationDelay: showAgent || showBrowse ? "420ms" : "3150ms" }}
    >
      <div className="rounded-[16px] border border-black/[0.08] bg-white p-4 text-left shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] sm:p-5">
        <div className="mb-3 space-y-1">
          <p className="text-sm font-medium text-[#161616]">Tools</p>
          <p className="text-sm font-light text-black/62">
            Export raw CSVs and preview upcoming research tools.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => router.push("/data")}
            className="flex h-full items-start gap-3 rounded-[14px] border border-black/[0.08] bg-white p-3.5 text-left transition-colors hover:bg-[#f7fbff]"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#eef5ff] p-2 text-[#1080ff]">
              <Database className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">Get the data</p>
              <p className="text-xs font-light leading-5 text-black/62">
                Download raw CSV market data.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled
            className="relative flex h-full items-start gap-3 rounded-[14px] border border-black/[0.08] bg-[#fbfcff] p-3.5 text-left opacity-80"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#eef5ff] p-2 text-[#1080ff]">
              <FileSearch className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">Equity analysis</p>
              <p className="text-xs font-light leading-5 text-black/62">
                Browse equity reports with AI.
              </p>
            </div>
            <span className="absolute right-3 top-3 rounded-full bg-[#f4f8ff] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-black/52">
              Soon
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/quant")}
            className="relative flex h-full items-start gap-3 rounded-[14px] border border-[#E8701A]/14 bg-[#fffaf5] p-3.5 text-left transition-colors hover:bg-[#ffefe0]"
          >
            <div className="mt-0.5 rounded-[10px] bg-[#fff0e2] p-2 text-[#E8701A]">
              <QuantAlphaIcon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#161616]">Quant Alpha</p>
              <p className="text-xs font-light leading-5 text-black/62">
                Options analytics, volatility surfaces, and Greeks for U.S. equities.
              </p>
            </div>
            <span className="absolute right-3 top-3 rounded-full bg-[#fff0e2] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#c85f14]">
              Live
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />

      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] flex-col items-center px-6 py-6 text-center lg:px-8 lg:py-8">
        <div className="absolute left-6 top-3 z-20 lg:left-8">
          <RequestQuotaBadge />
        </div>
        <div className="absolute right-6 top-3 z-20 flex items-center gap-2 lg:right-8">
          <Link
            href="/quant"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-[#E8701A]/16 bg-[#fff6ed] px-3.5 text-sm text-[#c85f14] shadow-[0_16px_30px_-24px_rgba(232,112,26,0.28)] backdrop-blur-sm transition-colors hover:bg-[#ffefe0]"
          >
            <QuantAlphaIcon className="h-4 w-4" />
            Quant Alpha
          </Link>
          <button
            type="button"
            disabled
            className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-black/[0.08] bg-white/92 px-3.5 text-sm text-black/62 shadow-[0_16px_30px_-24px_rgba(0,0,0,0.14)] backdrop-blur-sm"
          >
            <LogIn className="h-4 w-4" />
            Login
            <span className="text-black/44">(coming soon)</span>
          </button>
        </div>

        <section className="flex w-full max-w-[960px] flex-col items-center gap-4">
          <div
            className="animate-[fadeSlideUp_0.65s_ease-out_both] text-sm font-normal text-black/58"
            style={{ animationDelay: "2200ms" }}
          >
            Open-source financial intelligence
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="relative flex justify-center">
              <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-full bg-[#1080ff]/8 blur-3xl animate-[heroLogoGlow_3.2s_cubic-bezier(0.19,1,0.22,1)_both]" />
              <Image
                src="/openalpha_logo_light.svg"
                alt="OpenAlpha"
                width={880}
                height={250}
                priority
                className="relative h-auto w-full max-w-[400px] animate-[heroLogoReveal_3.1s_cubic-bezier(0.19,1,0.22,1)_both]"
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

          <div className="w-full max-w-[920px]">
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
                className="animate-[fadeSlideUp_0.75s_ease-out_both] rounded-[16px] border border-black/[0.08] bg-white px-6 py-5 text-left shadow-[0_30px_60px_-38px_rgba(0,0,0,0.1)] sm:px-7"
                style={{ animationDelay: "2850ms" }}
              >
                  <div className="flex flex-col gap-3">
                    <div className="space-y-1.5">
                      <h2 className="text-2xl font-medium tracking-tight text-[#161616] sm:text-[1.8rem]">
                        Start with the agent
                      </h2>
                      <p className="text-sm leading-7 font-light text-black/70 sm:text-[15px]">
                        Ask a market question, compare companies, or explore macro trends with Alpha.
                      </p>
                    </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => {
                        shouldScrollToAgentRef.current = true;
                        setBrowseMode("stocks");
                        setShowAgent(true);
                        setShowBrowse(true);
                      }}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1080ff] px-5 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]"
                    >
                      Ask Alpha
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!showAgent && !showBrowse && (
            <>
              {assetClassesSection}
              {toolsSection}
            </>
          )}

          {showBrowse && (
            <div
              className="w-full max-w-[920px] animate-[fadeSlideUp_0.75s_ease-out_both]"
              style={{ animationDelay: showAgent ? "150ms" : "80ms" }}
            >
              <div className="rounded-[16px] border border-black/[0.08] bg-white p-5 text-left shadow-[0_30px_60px_-38px_rgba(0,0,0,0.1)] sm:p-6">
                <div className="mb-4 space-y-3 text-center">
                  <p className="text-[11px] font-normal uppercase tracking-[0.22em] text-black/52">
                    Browse Directly
                  </p>
                  <h2 className="text-xl font-medium tracking-tight text-[#161616]">
                    {browseMode === "stocks"
                      ? "Open a stock workspace in one move"
                      : browseMode === "commodities"
                        ? "Open a commodity dashboard in one move"
                        : browseMode === "macro"
                          ? "Open a macro dashboard in one move"
                        : "Open a crypto dashboard in one move"}
                  </h2>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBrowseMode("stocks")}
                      className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                        browseMode === "stocks"
                          ? "bg-[#1080ff] text-white"
                          : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                      }`}
                    >
                      Stocks
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrowseMode("commodities")}
                      className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                        browseMode === "commodities"
                          ? "bg-[#1080ff] text-white"
                          : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                      }`}
                    >
                      Commodities
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrowseMode("macro")}
                      className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                        browseMode === "macro"
                          ? "bg-[#1080ff] text-white"
                          : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                      }`}
                    >
                      Macro
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrowseMode("crypto")}
                      className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                        browseMode === "crypto"
                          ? "bg-[#1080ff] text-white"
                          : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                      }`}
                    >
                      Crypto
                    </button>
                  </div>
                </div>
                {browseMode === "stocks" ? (
                  <TickerSearch
                    size="lg"
                    variant="hero"
                    autoFocus={!showAgent}
                  />
                ) : browseMode === "commodities" ? (
                  <CommoditySearch
                    size="lg"
                    variant="hero"
                    autoFocus={!showAgent}
                  />
                ) : browseMode === "macro" ? (
                  <MacroSearch
                    size="lg"
                    variant="hero"
                    autoFocus={!showAgent}
                  />
                ) : (
                  <CryptoSearch
                    size="lg"
                    variant="hero"
                    autoFocus={!showAgent}
                  />
                )}
              </div>
            </div>
          )}
        </section>

        {(showAgent || showBrowse) && (
          <>
            <div className="mt-6 w-full max-w-[920px]">{toolsSection}</div>
            <section
              className="mt-12 grid w-full max-w-[1120px] gap-4 md:grid-cols-2 xl:grid-cols-4 animate-[fadeSlideUp_0.75s_ease-out_both]"
              style={{ animationDelay: showAgent ? "260ms" : "160ms" }}
            >
              {FEATURE_CARDS.map((feature) => {
                const Icon = feature.icon;

                return (
                  <div
                    key={feature.title}
                    className="group rounded-[16px] border border-black/[0.08] bg-white p-5 text-left shadow-[0_20px_46px_-42px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-black/[0.12] hover:bg-[#fcfbf9]"
                  >
                    <div className="mb-4 inline-flex rounded-[10px] border border-black/[0.08] bg-[#f7f6f2] p-3 text-black/64">
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
          </>
        )}

        <footer className="mt-10 flex w-full max-w-[1120px] flex-col gap-3 border-t border-black/[0.08] pt-5 text-sm text-black/52 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-light">
            OpenAlpha combines prices, fundamentals, filings, macro indicators,
            and a Mistral-powered agent.
          </p>
          <Link
            href="/about"
            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-3.5 text-sm text-black/62 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
          >
            About
          </Link>
        </footer>
      </main>
    </div>
  );
}
