"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Filing } from "@/types/api";
import { AlertTriangle, ChevronRight, ExternalLink, FileText } from "lucide-react";

export default function FilingsPanel({
  filings,
  error,
}: {
  filings: Filing[];
  error?: string | null;
}) {
  if (error) {
    return (
      <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">SEC Filings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2.5 text-sm text-[#b93828]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (filings.length === 0) {
    return (
      <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">SEC Filings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-light text-black/64">No filings available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
      <CardHeader>
        <CardTitle className="text-[#161616]">SEC Filings</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-3">
            {filings.map((filing) => (
              <FilingItem key={filing.accession_number} filing={filing} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function FilingItem({ filing }: { filing: Filing }) {
  return (
    <Collapsible className="rounded-[14px] border border-black/[0.08] bg-[#fbfcff]">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[#f4f8ff] [&[data-panel-open]>svg:first-child]:rotate-90">
        <ChevronRight className="h-4 w-4 shrink-0 text-black/44 transition-transform" />
        <FileText className="h-4 w-4 shrink-0 text-black/44" />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-[#161616]">{filing.form_type}</span>
          <span className="ml-2 text-black/52">
            {new Date(filing.filing_date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <a
          href={filing.sec_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-black/32 transition-colors hover:text-[#1080ff]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="space-y-3 border-t border-black/[0.08] px-4 py-3">
          {filing.sections.length > 0 ? (
            filing.sections.map((section, i) => (
              <div key={i}>
                <h4 className="text-xs font-medium uppercase tracking-wider text-black/48">
                  {section.title}
                </h4>
                <p className="mt-1 line-clamp-6 text-sm leading-relaxed text-black/72">
                  {section.content}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-black/62">
              No parsed sections available.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
