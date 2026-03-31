import type { AgentRequest } from "@/types/api";
import type { AgentToolResultRecord } from "@/server/agent/service";
import type { AgentPolicy, AgentToolName } from "@/server/agent/policy";

const NEGATED_CAPABILITY_WORDS =
  /\b(not available|not supported|don't have|do not have|cannot|can't|only have|not in (?:the )?tool output|unavailable)\b/i;
const SENTENCE_REGEX = /[^.!?\n]+[.!?\n]?/g;
const UNSAFE_TIME_WORDS =
  /\b(today|as of today|right now|currently|at the moment)\b/i;

export type AnswerValidationResult = {
  valid: boolean;
  issues: string[];
};

function normalizeAnswerText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function findSentence(answer: string, pattern: RegExp): string | null {
  const sentences = normalizeAnswerText(answer).match(SENTENCE_REGEX) ?? [];
  for (const sentence of sentences) {
    if (pattern.test(sentence)) {
      return sentence.trim();
    }
  }

  return null;
}

function hasPositiveReference(answer: string, pattern: RegExp): boolean {
  const sentence = findSentence(answer, pattern);
  return sentence != null && !NEGATED_CAPABILITY_WORDS.test(sentence);
}

function hasSuccessfulTool(toolResults: AgentToolResultRecord[]): boolean {
  return toolResults.some((result) => result.success);
}

function collectMacroDates(toolResults: AgentToolResultRecord[]): string[] {
  return toolResults.flatMap((result) => {
    if (!result.success || !result.parsedContent || typeof result.parsedContent !== "object") {
      return [];
    }

    const entries = Object.values(result.parsedContent as Record<string, unknown>);
    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const latestDate = Reflect.get(entry, "latest_date");
      return typeof latestDate === "string" ? [latestDate] : [];
    });
  });
}

function collectToolNames(toolResults: AgentToolResultRecord[]): Set<AgentToolName> {
  return new Set(toolResults.map((result) => result.name as AgentToolName));
}

function shouldFlagOpenInterestUnit(answer: string): boolean {
  return /\bopen interest\b[\s\S]{0,40}\b(btc|usd)\b/i.test(
    normalizeAnswerText(answer),
  );
}

function mentionsAverageVolume(answer: string): boolean {
  return /\b(volume[\s\S]{0,24}(?:avg|average)|(?:avg|average)[\s\S]{0,24}volume)\b/i.test(
    normalizeAnswerText(answer),
  );
}

function hasEmptyMarkdownLink(answer: string): boolean {
  return /\[[^\]]+\]\(\s*\)/.test(normalizeAnswerText(answer));
}

export function validateAgentAnswer(
  request: AgentRequest,
  policy: AgentPolicy,
  answer: string,
  toolResults: AgentToolResultRecord[],
): AnswerValidationResult {
  const issues: string[] = [];
  const normalizedAnswer = normalizeAnswerText(answer);
  const toolNames = collectToolNames(toolResults);

  if (!normalizedAnswer.trim()) {
    issues.push("The answer was empty.");
    return { valid: false, issues };
  }

  if (!hasSuccessfulTool(toolResults)) {
    if (!NEGATED_CAPABILITY_WORDS.test(normalizedAnswer)) {
      issues.push("All tool calls failed, so the answer must explicitly say the data is unavailable.");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  if (
    !toolNames.has("get_news") &&
    !toolNames.has("get_context_news") &&
    hasPositiveReference(normalizedAnswer, /\b(news|headline|headlines|articles?)\b/i)
  ) {
    issues.push("Do not discuss news or headlines without using the news tool.");
  }

  if (
    !toolNames.has("get_sec_filings") &&
    hasPositiveReference(normalizedAnswer, /\b(10-k|10-q|latest filing|risk factors|md&a|mda)\b/i)
  ) {
    issues.push("Do not discuss filing content without using the filings tool.");
  }

  if (hasEmptyMarkdownLink(normalizedAnswer)) {
    issues.push("Do not render empty markdown links when no usable article URL is available.");
  }

  if (policy.strictSubject === "ticker" || request.ticker) {
    if (
      toolNames.has("get_stock_overview") &&
      !toolNames.has("get_price_history") &&
      mentionsAverageVolume(normalizedAnswer)
    ) {
      issues.push("Do not mention average volume unless the tool output explicitly provided it.");
    }

    if (
      !toolNames.has("get_news") &&
      /\b(catalyst|event-driven|earnings|macro (?:tech )?sentiment|tech tone|company-specific)\b/i.test(
        normalizedAnswer,
      ) &&
      !NEGATED_CAPABILITY_WORDS.test(normalizedAnswer)
    ) {
      issues.push("Do not infer catalysts, earnings, or macro sentiment from a stock snapshot-only answer.");
    }

    if (
      !toolNames.has("get_context_news") &&
      /\b(broader market|market backdrop|geopolitical|risk-off|risk on|tariff|tariffs)\b/i.test(
        normalizedAnswer,
      ) &&
      !NEGATED_CAPABILITY_WORDS.test(normalizedAnswer)
    ) {
      issues.push("Do not discuss broader market or geopolitical backdrop without context news.");
    }
  }

  if (policy.strictSubject === "macro" && UNSAFE_TIME_WORDS.test(normalizedAnswer)) {
    const dates = collectMacroDates(toolResults);
    const latestDate = dates.sort().at(-1);
    const today = new Date().toISOString().slice(0, 10);

    if (latestDate && latestDate.slice(0, 10) !== today) {
      issues.push("Do not use current/today wording when the latest macro data date is older than today.");
    }
  }

  if (policy.strictSubject === "crypto" && shouldFlagOpenInterestUnit(normalizedAnswer)) {
    issues.push("Do not convert crypto open interest into BTC or USD units unless the tool output explicitly labels that unit.");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function buildAnswerRevisionPrompt(issues: string[]): string {
  return [
    "Your last draft is not compliant with the tool output or request policy.",
    ...issues.map((issue) => `- ${issue}`),
    "Rewrite the answer using only supported facts from the tool output.",
    "Keep the answer concise and do not introduce any unsupported claims or units.",
  ].join("\n");
}
