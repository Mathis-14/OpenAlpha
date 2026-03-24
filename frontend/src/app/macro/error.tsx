"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MacroError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafcff] px-6">
      <Card className="w-full max-w-md rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-light text-black/64">
            {error.message || "An unexpected error occurred while loading macro data."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="rounded-full bg-[#1080ff] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-full border border-black/[0.08] px-4 py-2 text-sm font-medium text-[#161616] transition-colors hover:bg-[#f4f8ff]"
            >
              Back to home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
