import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NewsFeed from "./news-feed.tsx";

test("NewsFeed renders grouped focused and context sections", () => {
  const markup = renderToStaticMarkup(
    React.createElement(NewsFeed, {
      sections: [
        {
          id: "focused",
          title: "Company News",
          articles: [
            {
              title: "Apple launches new device",
              source: "Yahoo Finance",
              published: "2026-03-31T12:00:00.000Z",
              summary: "Apple headlines stay active.",
              url: "https://example.com/apple",
            },
          ],
        },
        {
          id: "context",
          title: "Market Context",
          articles: [],
          warnings: ["Context feed is thin."],
        },
      ],
    }),
  );

  assert.match(markup, /Company News/);
  assert.match(markup, /Market Context/);
  assert.match(markup, /Apple launches new device/);
  assert.match(markup, /Context feed is thin/);
});
