import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RelativeTime from "@/components/relative-time";
import type { NewsArticle } from "@/types/api";
import { AlertTriangle, ExternalLink } from "lucide-react";

type NewsSection = {
  id: string;
  title: string;
  articles: NewsArticle[];
  warnings?: string[];
  error?: string | null;
};

export default function NewsFeed({
  sections,
  articles,
  error,
  fillHeight = false,
}: {
  sections?: NewsSection[];
  articles?: NewsArticle[];
  error?: string | null;
  fillHeight?: boolean;
}) {
  const normalizedSections =
    sections && sections.length > 0
      ? sections
      : [
          {
            id: "news",
            title: "News",
            articles: articles ?? [],
            error,
          },
        ];

  return (
    <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
      <CardHeader>
        <CardTitle className="text-[#161616]">News</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <div className={`${fillHeight ? "h-full min-h-0" : "h-[400px] min-h-0"} overflow-y-auto pr-3`}>
          <div className="space-y-6">
            {normalizedSections.map((section) => (
              <section key={section.id} className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-[#161616]">{section.title}</h3>
                </div>

                {section.error ? (
                  <div className="flex items-start gap-2.5 text-sm text-[#b93828]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{section.error}</p>
                  </div>
                ) : null}

                {!section.error && section.warnings?.length ? (
                  <div className="space-y-1">
                    {section.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="flex items-start gap-2.5 text-sm text-[#8b6b17]"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{warning}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {!section.error && section.articles.length === 0 ? (
                  <p className="text-sm font-light text-black/64">
                    No {section.title.toLowerCase()} articles returned at this time.
                  </p>
                ) : null}

                {!section.error && section.articles.length > 0 ? (
                  <ul className="divide-y divide-black/[0.06]">
                    {section.articles.map((article, index) => (
                      <li key={`${section.id}-${index}`} className="py-3 first:pt-0 last:pb-0">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-[#161616] transition-colors group-hover:text-[#1080ff]">
                              {article.title}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-black/62">
                              {article.summary}
                            </p>
                            <p className="mt-1 text-xs text-black/46">
                              {article.source}
                              {article.published && (
                                <>
                                  {" · "}
                                  <RelativeTime value={article.published} />
                                </>
                              )}
                            </p>
                          </div>
                          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/32 transition-colors group-hover:text-[#1080ff]" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
