import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NewsArticle } from "@/types/api";
import { ExternalLink } from "lucide-react";

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

export default function NewsFeed({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60">
        <CardHeader>
          <CardTitle>News</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No news available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader>
        <CardTitle>News</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/40">
          {articles.map((a, i) => (
            <li key={i} className="py-3 first:pt-0 last:pb-0">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
                    {a.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                    {a.summary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    {a.source}
                    {a.published && ` · ${timeAgo(a.published)}`}
                  </p>
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
