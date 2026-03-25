import Link from "next/link";
import { Coins, Globe, House, PackageSearch, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const QUICK_LINKS = [
  {
    title: "Stock dashboard",
    description: "Open an equity workspace.",
    href: "/dashboard/AAPL",
    Icon: Search,
  },
  {
    title: "Macro dashboard",
    description: "Rates, inflation, and growth.",
    href: "/macro",
    Icon: Globe,
  },
  {
    title: "Commodities dashboard",
    description: "Metals, energy, and crops.",
    href: "/commodities/gold",
    Icon: PackageSearch,
  },
  {
    title: "Crypto dashboard",
    description: "BTC and ETH perpetuals.",
    href: "/crypto/BTC-PERPETUAL",
    Icon: Coins,
  },
] as const;

export default function DataQuickLinks() {
  return (
    <Card className="rounded-[15px] border border-black/[0.08] bg-white shadow-[0_20px_40px_-34px_rgba(0,0,0,0.08)]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base text-[#161616]">Quick links</CardTitle>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[11px] border border-black/[0.08] bg-[#fbfdff] px-3 py-1.5 text-xs font-medium text-[#161616] transition-colors hover:bg-[#f4f8ff]"
        >
          <House className="h-3.5 w-3.5 text-[#1080ff]" />
          Home
        </Link>
      </CardHeader>
      <CardContent className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {QUICK_LINKS.map(({ title, description, href, Icon }) => (
          <Link
            key={title}
            href={href}
            className="flex items-start gap-3 rounded-[13px] border border-black/[0.08] bg-[#fbfdff] p-3.5 text-left transition-colors hover:bg-[#f4f8ff]"
          >
            <div className="mt-0.5 rounded-[9px] bg-[#eef5ff] p-1.5 text-[#1080ff]">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[15px] font-medium text-[#161616]">{title}</p>
              <p className="text-[11px] leading-4.5 font-light text-black/62">
                {description}
              </p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
