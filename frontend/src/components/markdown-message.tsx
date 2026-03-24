"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  tone?: "default" | "light";
}

export default function MarkdownMessage({
  content,
  className = "",
  tone = "default",
}: MarkdownMessageProps) {
  const isLight = tone === "light";

  return (
    <div className={`markdown-message text-left ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h3
              className={`mt-4 mb-2 text-base first:mt-0 ${
                isLight
                  ? "font-semibold text-[#161616]"
                  : "font-bold text-foreground"
              }`}
            >
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h4
              className={`mt-3 mb-1.5 text-sm first:mt-0 ${
                isLight
                  ? "font-semibold text-[#161616]"
                  : "font-bold text-foreground"
              }`}
            >
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5
              className={`mt-2 mb-1 text-sm first:mt-0 ${
                isLight
                  ? "font-medium text-[#161616]"
                  : "font-semibold text-foreground"
              }`}
            >
              {children}
            </h5>
          ),
          p: ({ children }) => (
            <p
              className={`mb-2 leading-relaxed last:mb-0 ${
                isLight ? "text-black/78" : ""
              }`}
            >
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className={isLight ? "leading-relaxed text-black/78" : "leading-relaxed"}>
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong
              className={
                isLight ? "font-medium text-[#161616]" : "font-semibold text-foreground"
              }
            >
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className={isLight ? "text-black/64" : "text-foreground/80"}>
              {children}
            </em>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={
                isLight
                  ? "text-[#161616] underline underline-offset-2 hover:text-black/72"
                  : "text-primary underline underline-offset-2 hover:text-primary/80"
              }
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code
                  className={
                    isLight
                      ? "rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-xs text-[#161616]"
                      : "rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/90"
                  }
                >
                  {children}
                </code>
              );
            }

            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className={
                isLight
                  ? "mb-2 overflow-x-auto rounded-lg bg-black/[0.04] p-3 text-xs text-[#161616] last:mb-0"
                  : "mb-2 overflow-x-auto rounded-lg bg-muted/80 p-3 text-xs last:mb-0"
              }
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead
              className={
                isLight ? "border-b border-black/[0.08]" : "border-b border-border/50"
              }
            >
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th
              className={
                isLight
                  ? "px-2 py-1.5 text-left font-medium text-[#161616]"
                  : "px-2 py-1.5 text-left font-semibold text-foreground"
              }
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className={
                isLight
                  ? "px-2 py-1.5 text-black/64"
                  : "px-2 py-1.5 text-muted-foreground"
              }
            >
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={
                isLight
                  ? "mb-2 border-l-2 border-black/[0.12] pl-3 text-black/62 italic last:mb-0"
                  : "mb-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic last:mb-0"
              }
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className={isLight ? "my-3 border-black/[0.08]" : "my-3 border-border/40"} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
