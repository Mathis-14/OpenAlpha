import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NewsArticle } from "@/types/api";
import { AlertTriangle, ExternalLink } from "lucide-react";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NewsFeed({
  articles,
  error,
}: {
  articles: NewsArticle[];
  error?: string | null;
}) {
  if (error) {
    return (
      <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">News</CardTitle>
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

  if (articles.length === 0) {
    return (
      <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <CardHeader>
          <CardTitle className="text-[#161616]">News</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-light text-black/64">No news available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
      <CardHeader>
        <CardTitle className="text-[#161616]">News</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <ul className="divide-y divide-black/[0.06] pr-3">
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
                      {a.published && ` · ${timeAgo(a.published)}`}
                    </p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/32 transition-colors group-hover:text-[#1080ff]" />
                </a>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
