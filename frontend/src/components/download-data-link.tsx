import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DownloadDataLink({
  href,
  label = "Download data",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-black/[0.08] bg-white px-3.5 text-sm text-[#161616] transition-colors hover:bg-[#f4f8ff]",
        className,
      )}
    >
      <Download className="h-4 w-4" />
      {label}
    </Link>
  );
}
