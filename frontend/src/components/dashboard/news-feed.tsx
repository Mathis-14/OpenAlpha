import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RelativeTime from "@/components/relative-time";
import type { NewsArticle } from "@/types/api";
import { AlertTriangle, ExternalLink } from "lucide-react";

export default function NewsFeed({
  articles,
  error,
  fillHeight = false,
}: {
  articles: NewsArticle[];
  error?: string | null;
  fillHeight?: boolean;
}) {
  if (error) {
    return (
      <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">News</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-start">
          <div className="flex items-start gap-2.5 text-sm text-[#b93828]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (articles.length === 0) {
    return (
      <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">News</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-start">
          <p className="text-sm font-light text-black/64">No news available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
      <CardHeader>
        <CardTitle className="text-[#161616]">News</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <div className={`${fillHeight ? "h-full min-h-0" : "h-[400px] min-h-0"} overflow-y-auto pr-3`}>
          <ul className="divide-y divide-black/[0.06]">
            {articles.map((a, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-[#161616] transition-colors group-hover:text-[#1080ff]">
                      {a.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-black/62">
                      {a.summary}
                    </p>
                    <p className="mt-1 text-xs text-black/46">
                      {a.source}
                      {a.published && (
                        <>
                          {" · "}
                          <RelativeTime value={a.published} />
                        </>
                      )}
                    </p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/32 transition-colors group-hover:text-[#1080ff]" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
