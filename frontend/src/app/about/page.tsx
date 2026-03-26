import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, HeartHandshake, Layers3, ShieldCheck } from "lucide-react";
import LandingSpotlight from "@/components/landing-spotlight";

const PROVIDERS = [
  {
    name: "Mistral",
    description: "Agent reasoning and conversational workflow orchestration.",
  },
  {
    name: "FRED",
    description: "Macroeconomic time series and official benchmark data.",
  },
  {
    name: "SEC EDGAR",
    description: "Company filings and public regulatory documents.",
  },
  {
    name: "Yahoo Finance",
    description: "Equity and futures market data used across dashboards.",
  },
  {
    name: "Deribit",
    description: "BTC and ETH perpetual crypto market data.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="relative z-10 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-3">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Image
              src="/openalpha_logo_light.svg"
              alt="OpenAlpha"
              width={680}
              height={200}
              className="h-8 w-auto"
            />
          </Link>

          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-3.5 text-sm text-black/62 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
          >
            Back home
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-[1120px] flex-col gap-8 px-6 py-12">
        <section className="rounded-[24px] border border-black/[0.08] bg-white p-8 shadow-[0_34px_70px_-40px_rgba(0,0,0,0.12)]">
          <div className="max-w-[760px] space-y-4">
            <p className="text-sm font-normal text-black/58">
              About OpenAlpha
            </p>
            <h1 className="text-[2.35rem] leading-tight font-medium tracking-tight text-[#161616] sm:text-[2.9rem]">
              A focused financial intelligence AI workspace
            </h1>
            <p className="max-w-[680px] text-[1.02rem] leading-8 font-light text-black/66">
              OpenAlpha is a single-deploy Next.js application designed to make
              financial data exploration faster, cleaner, and more grounded. It
              combines dashboards, CSV retrieval, and an AI agent that calls
              live tools before answering.
            </p>
            <p className="max-w-[680px] text-[0.98rem] leading-7 font-light text-black/62">
              I built OpenAlpha as a focused
              interface for market research, structured data access, and
              agent-assisted financial workflows.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="https://github.com/Mathis-14/OpenAlpha"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#1080ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]"
              >
                <ArrowUpRight className="h-4 w-4" />
                View project on GitHub
              </a>
              <a
                href="https://github.com/Mathis-14"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-black/[0.08] bg-white px-4 text-sm text-black/64 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
              >
                <ArrowUpRight className="h-4 w-4" />
                Mathis, HEC x ENSAE
              </a>
              <a
                href="https://www.linkedin.com/in/mathis-villaret"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-black/[0.08] bg-white px-4 text-sm text-black/64 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
              >
                <ArrowUpRight className="h-4 w-4" />
                LinkedIn
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[24px] border border-black/[0.08] bg-white p-7 shadow-[0_30px_60px_-42px_rgba(0,0,0,0.1)]">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-[12px] bg-[#eef5ff] p-2.5 text-[#1080ff]">
                <Layers3 className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-medium text-[#161616]">
                What the project tries to do
              </h2>
            </div>

            <div className="mt-5 space-y-4 text-[0.98rem] leading-7 font-light text-black/66">
              <p>
                My goal with OpenAlpha was: instead of trying to create
                a generic terminal, it exposes a curated set of workflows for
                equities, macro, commodities, crypto, and structured CSV export.
              </p>
              <p>
                The goal is to make research faster for the workflows that
                matter most in practice: understanding an asset, retrieving the
                underlying data cleanly, and using an agent that is forced to
                work from live tools instead of generic market memory.
              </p>
              <p>
                The AI layer is also intentionally grounded. On dashboards, the
                agent stays tied to the current asset or country context. On the
                data page, the agent acts as a planning assistant and maps one
                project to one export at a time.
              </p>
              <p>
                The current product direction is frontend-only: the active app
                runs in Next.js with server-side route handlers, while the
                Python backend remains in the repository as legacy reference
                code.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/[0.08] bg-white p-7 shadow-[0_30px_60px_-42px_rgba(0,0,0,0.1)]">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-[12px] bg-[#eef5ff] p-2.5 text-[#1080ff]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-medium text-[#161616]">
                Thanks to data providers
              </h2>
            </div>

            <ul className="mt-5 space-y-3">
              {PROVIDERS.map((provider) => (
                <li
                  key={provider.name}
                  className="rounded-[16px] border border-black/[0.08] bg-[#fbfdff] px-4 py-3"
                >
                  <p className="text-sm font-medium text-[#161616]">
                    {provider.name}
                  </p>
                  <p className="mt-1 text-sm leading-6 font-light text-black/62">
                    {provider.description}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-start gap-2 rounded-[14px] border border-black/[0.08] bg-[#f8fbff] px-4 py-3 text-sm text-black/62">
              <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-[#1080ff]" />
              <p className="leading-6">
                OpenAlpha depends on public and commercial data/services. This
                page is a simple acknowledgment of the providers that make the
                current product possible.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
