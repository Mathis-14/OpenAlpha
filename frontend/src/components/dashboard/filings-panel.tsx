"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Filing } from "@/types/api";
import { ChevronRight, ExternalLink, FileText } from "lucide-react";

export default function FilingsPanel({ filings }: { filings: Filing[] }) {
  if (filings.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60">
        <CardHeader>
          <CardTitle>SEC Filings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No filings available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader>
        <CardTitle>SEC Filings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {filings.map((filing) => (
          <FilingItem key={filing.accession_number} filing={filing} />
        ))}
      </CardContent>
    </Card>
  );
}

function FilingItem({ filing }: { filing: Filing }) {
  return (
    <Collapsible className="rounded-lg border border-border/40 bg-background/40">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 [&[data-panel-open]>svg:first-child]:rotate-90">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <span className="font-medium">{filing.form_type}</span>
          <span className="ml-2 text-muted-foreground">
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
          className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="space-y-3 border-t border-border/40 px-4 py-3">
          {filing.sections.length > 0 ? (
            filing.sections.map((section, i) => (
              <div key={i}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80 line-clamp-6">
                  {section.content}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No parsed sections available.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
