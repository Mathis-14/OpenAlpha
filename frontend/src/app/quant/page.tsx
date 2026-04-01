import Link from "next/link";
import LandingSpotlight from "@/components/landing-spotlight";
import QuantAlphaIcon from "@/components/quant-alpha-icon";
import QuantWorkspace from "@/components/quant/quant-workspace";
import { Badge } from "@/components/ui/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function QuantPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fffaf6]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,250,246,0.68),rgba(255,248,242,0.88)_34%,rgba(255,249,244,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-[#E8701A]/10 bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-[12px] border border-[#E8701A]/12 bg-[#fff8f2] px-3 py-2 transition-colors hover:bg-[#ffefe0]"
            >
              <QuantAlphaIcon className="h-7 w-7" />
              <div className="text-left">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#c85f14]">
                  Quant Alpha
                </p>
                <p className="text-sm text-[#161616]">
                  Options analytics workspace
                </p>
              </div>
            </Link>
          </div>

          <Badge className="border-[#E8701A]/16 bg-[#fff3e8] text-[#c85f14] hover:bg-[#fff3e8]">
            U.S. equity options
          </Badge>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1380px] px-6 py-6">
        <QuantWorkspace />
      </main>
    </div>
  );
}
