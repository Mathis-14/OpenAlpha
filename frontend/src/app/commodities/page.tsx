import Image from "next/image";
import Link from "next/link";
import LandingSpotlight from "@/components/landing-spotlight";
import CommoditySearch from "@/components/commodity-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RequestQuotaBadge from "@/components/request-quota-badge";
import {
  SUPPORTED_COMMODITIES,
  getCommodityCategoryLabel,
} from "@/lib/commodities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CommoditiesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="shrink-0 transition-opacity hover:opacity-80">
              <Image
                src="/openalpha_logo_light.svg"
                alt="OpenAlpha"
                width={680}
                height={200}
                className="h-8 w-auto"
              />
            </Link>
            <RequestQuotaBadge />
          </div>
          <div className="rounded-full border border-black/[0.08] bg-[#f4f8ff] px-3 py-1 text-sm text-[#161616]">
            Commodities · Explore
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-6 py-10">
        <section className="mx-auto max-w-[960px] space-y-6 text-center">
          <div className="space-y-3">
            <p className="text-sm font-normal text-black/58">
              Free commodity dashboards
            </p>
            <h1 className="text-4xl font-medium tracking-tight text-[#161616] sm:text-[3.2rem]">
              Browse commodities with a stock-like workflow
            </h1>
            <p className="mx-auto max-w-[720px] text-lg leading-8 font-light text-black/68">
              Start with a supported benchmark, open the dedicated dashboard, and
              use Alpha for price and trend questions across metals, energy, agriculture, and benchmark indices.
            </p>
          </div>

          <div className="rounded-[16px] border border-black/[0.08] bg-white p-5 shadow-[0_30px_60px_-38px_rgba(0,0,0,0.1)] sm:p-6">
            <CommoditySearch size="lg" variant="hero" autoFocus />
          </div>
        </section>

        <section className="mx-auto mt-10 grid max-w-[1120px] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SUPPORTED_COMMODITIES.map((item) => (
            <Link key={item.instrument} href={`/commodities/${item.instrument}`}>
                <Card className="h-full rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] transition-colors hover:border-black/[0.12] hover:bg-[#fcfbf9]">
                  <CardHeader>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        {item.logoSrc ? (
                          <Image
                            src={item.logoSrc}
                            alt={`${item.name} logo`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-[#eef5ff]" />
                        )}
                        <div className="space-y-1">
                          <p className="text-xs font-normal uppercase tracking-[0.18em] text-black/46">
                            {getCommodityCategoryLabel(item.category)}
                          </p>
                          <CardTitle className="text-2xl font-medium tracking-tight text-[#161616]">
                            {item.name}
                          </CardTitle>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm font-light leading-6 text-black/62">
                    {item.description}
                  </p>
                  <div className="space-y-1 text-sm text-black/52">
                    <p>{item.unit_label}</p>
                    <p>{item.exchange_label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
