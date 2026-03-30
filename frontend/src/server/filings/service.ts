import type { Filing, FilingSection, FilingsResponse } from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import { fetchJson, fetchText } from "@/server/shared/http";

const SEC_REVALIDATE_SECONDS = 1800;
const SEC_TIMEOUT_MS = 10_000;
const MAX_SECTION_LENGTH = 15_000;
const MIN_SECTION_LENGTH = 500;

const SECTION_KEYS_10K = [
  { key: "Item 1", title: "Business", next: ["Item 1A", "Item 2"] },
  { key: "Item 1A", title: "Risk Factors", next: ["Item 1B", "Item 2"] },
  {
    key: "Item 7",
    title: "Management's Discussion and Analysis",
    next: ["Item 7A", "Item 8"],
  },
] as const;

const SECTION_KEYS_10Q = [
  { key: "Item 1", title: "Financial Statements", next: ["Item 1A", "Item 2"] },
  { key: "Item 1A", title: "Risk Factors", next: ["Item 2", "Item 3"] },
  {
    key: "Item 2",
    title: "Management's Discussion and Analysis",
    next: ["Item 3", "Item 4"],
  },
] as const;

type CompanyTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

type CompanyTickersResponse = Record<string, CompanyTickerEntry>;

type SecRecentFilings = {
  accessionNumber?: string[];
  filingDate?: string[];
  form?: string[];
  primaryDocument?: string[];
};

type SecSubmissionsResponse = {
  filings?: {
    recent?: SecRecentFilings;
  };
};

function getSecHeaders(): HeadersInit {
  const identity =
    process.env.EDGAR_USER_AGENT?.trim() || "OpenAlpha dev@openalpha.io";

  return {
    "User-Agent": identity,
    Accept: "application/json, text/html;q=0.9,*/*;q=0.8",
  };
}

function padCik(cik: number): string {
  return String(cik).padStart(10, "0");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/section|\/article|\/table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#160;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildItemPattern(key: string, flags: string): RegExp {
  return new RegExp(
    `(?:^|\\n+)\\s*${escapeRegExp(key)}(?=[\\s\\.:\\-–])[\\s\\.:\\-–]*`,
    flags,
  );
}

function truncateSection(content: string): string {
  if (content.length <= MAX_SECTION_LENGTH) {
    return content;
  }
  return `${content.slice(0, MAX_SECTION_LENGTH)}\n\n[...truncated]`;
}

function extractSections(
  filingText: string,
  formType: string,
): FilingSection[] {
  const normalizedText = filingText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  const sectionConfig = formType === "10-Q" ? SECTION_KEYS_10Q : SECTION_KEYS_10K;

  return sectionConfig.flatMap((section) => {
    const startPattern = buildItemPattern(section.key, "gi");
    const matches = [...normalizedText.matchAll(startPattern)];
    if (matches.length === 0) {
      return [];
    }

    let bestContent = "";

    for (const match of matches) {
      if (match.index == null) {
        continue;
      }

      const startIndex = match.index;
      const nextIndexes = section.next
        .map((nextKey) => {
          const nextPattern = buildItemPattern(nextKey, "i");
          const nextMatch = nextPattern.exec(normalizedText.slice(startIndex + 1));
          return nextMatch?.index == null ? -1 : startIndex + 1 + nextMatch.index;
        })
        .filter((index) => index > startIndex);

      const endIndex =
        nextIndexes.length > 0 ? Math.min(...nextIndexes) : normalizedText.length;
      const candidate = normalizedText.slice(startIndex, endIndex).trim();

      if (candidate.length > bestContent.length) {
        bestContent = candidate;
      }

      if (candidate.length >= MIN_SECTION_LENGTH) {
        return [{ title: section.title, content: truncateSection(candidate) }];
      }
    }

    return bestContent.length >= MIN_SECTION_LENGTH
      ? [{ title: section.title, content: truncateSection(bestContent) }]
      : [];
  });
}

async function getTickerToCikMap(): Promise<CompanyTickersResponse> {
  return fetchJson<CompanyTickersResponse>(
    "https://www.sec.gov/files/company_tickers.json",
    {
      headers: getSecHeaders(),
      revalidate: 86_400,
      timeoutMs: SEC_TIMEOUT_MS,
    },
  );
}

async function resolveCik(ticker: string): Promise<number> {
  try {
    const mapping = await getTickerToCikMap();
    const match = Object.values(mapping).find(
      (entry) => entry.ticker.toUpperCase() === ticker,
    );

    if (!match) {
      throw new ServiceError(404, {
        error: "invalid_ticker",
        ticker,
      });
    }

    return match.cik_str;
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }

    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "edgar",
    });
  }
}

async function getSubmissions(cik: number): Promise<SecSubmissionsResponse> {
  try {
    return await fetchJson<SecSubmissionsResponse>(
      `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`,
      {
        headers: getSecHeaders(),
        revalidate: SEC_REVALIDATE_SECONDS,
        timeoutMs: SEC_TIMEOUT_MS,
      },
    );
  } catch {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "edgar",
    });
  }
}

async function fetchFilingText(secUrl: string): Promise<{
  text: string;
  sectionsAvailable: boolean;
}> {
  try {
    const html = await fetchText(secUrl, {
      headers: getSecHeaders(),
      revalidate: SEC_REVALIDATE_SECONDS,
      timeoutMs: SEC_TIMEOUT_MS,
    });
    return {
      text: stripHtml(html),
      sectionsAvailable: true,
    };
  } catch {
    return {
      text: "",
      sectionsAvailable: false,
    };
  }
}

function buildSecUrl(
  cik: number,
  accessionNumber: string,
  primaryDocument: string,
): string {
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${primaryDocument}`;
}

export async function getFilings(
  ticker: string,
  formType: string = "10-K",
  limit: number = 3,
): Promise<FilingsResponse> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const cik = await resolveCik(normalizedTicker);
  const submissions = await getSubmissions(cik);
  const recent = submissions.filings?.recent;

  if (!recent) {
    return {
      ticker: normalizedTicker,
      filings: [],
      data_status: "complete",
    };
  }

  const filings: Filing[] = [];
  const warnings = new Set<string>();
  for (let index = 0; index < (recent.form?.length ?? 0); index += 1) {
    if ((recent.form?.[index] ?? "") !== formType) {
      continue;
    }

    const accessionNumber = recent.accessionNumber?.[index];
    const filingDate = recent.filingDate?.[index];
    const primaryDocument = recent.primaryDocument?.[index];
    if (!accessionNumber || !filingDate || !primaryDocument) {
      continue;
    }

    const secUrl = buildSecUrl(cik, accessionNumber, primaryDocument);
    const filingText = await fetchFilingText(secUrl);
    if (!filingText.sectionsAvailable) {
      warnings.add(
        "Some filing sections could not be fetched from the SEC. Filing metadata is still available.",
      );
    }
    filings.push({
      form_type: formType,
      filing_date: filingDate,
      accession_number: accessionNumber,
      sec_url: secUrl,
      sections: filingText.text ? extractSections(filingText.text, formType) : [],
      sections_available: filingText.sectionsAvailable,
    });

    if (filings.length >= limit) {
      break;
    }
  }

  return {
    ticker: normalizedTicker,
    filings,
    warnings: warnings.size > 0 ? Array.from(warnings) : undefined,
    data_status: warnings.size > 0 ? "partial" : "complete",
  };
}
