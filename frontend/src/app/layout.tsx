import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { UsageQuotaProvider } from "@/components/usage-quota-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenAlpha",
  description:
    "AI-powered financial intelligence, open source. Analyze stocks, macro indicators, and SEC filings with a conversational AI agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider>
          <AuthProvider>
            <UsageQuotaProvider>
              {children}
              <Analytics />
            </UsageQuotaProvider>
          </AuthProvider>
        </TooltipProvider>
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
