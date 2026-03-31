import type {
  AuditCase,
  AuditCaseResult,
  AuditFinding,
  AuditStatus,
  AuditTranscriptEvent,
} from "@/server/agent/audit/types";
import type {
  AgentToolCallRecord,
  AgentToolResultRecord,
} from "@/server/agent/service";

type EvaluationInput = Pick<
  AuditCaseResult,
  "transcript" | "toolCalls" | "toolResults" | "finalAnswer" | "displayDownload"
>;

type FlattenedNumber = {
  path: string;
  value: number;
};

type FlattenedDate = {
  path: string;
  value: string;
};

const UNSAFE_TIME_WORDS =
  /\b(today|as of today|right now|currently|at the moment|just now|this morning)\b/i;

const NEWS_RECENCY_WORDS = /\b(news|article|articles)\b/i;
const FILINGS_RECENCY_WORDS = /\b(latest 10-k|latest 10-q|latest filing)\b/i;
const NEGATED_CAPABILITY_WORDS =
  /\b(not available|not in tool output|don'?t have|do not have|only have|unsupported|aren't available|not supported|cannot|can'?t)\b/i;

const SENTENCE_REGEX = /[^.!?\n]+[.!?\n]?/g;

function normalizeAnswerText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ");
}

function buildPatternMatcher(pattern: RegExp): RegExp {
  const flags = pattern.flags.replace(/g/g, "").replace(/y/g, "");
  return new RegExp(pattern.source, flags);
}

function testPattern(pattern: RegExp, value: string): boolean {
  return buildPatternMatcher(pattern).test(normalizeAnswerText(value));
}

function createFinding(
  finding: AuditFinding,
): AuditFinding {
  return {
    level: finding.level,
    severity: finding.severity,
    category: finding.category,
    message: finding.message,
    evidence: finding.evidence,
    answerExcerpt: finding.answerExcerpt,
  };
}

function extractAnswerExcerpt(
  answer: string,
  matcher: RegExp | string,
): string | undefined {
  const sentences = answer.match(SENTENCE_REGEX) ?? [answer];
  for (const sentence of sentences) {
    if (typeof matcher === "string") {
      if (
        normalizeAnswerText(sentence)
          .toLowerCase()
          .includes(normalizeAnswerText(matcher).toLowerCase())
      ) {
        return sentence.trim();
      }
      continue;
    }

    if (testPattern(matcher, sentence)) {
      return sentence.trim();
    }
  }

  return answer.trim() || undefined;
}

function flattenToolNumbers(
  value: unknown,
  path: string = "",
  output: FlattenedNumber[] = [],
): FlattenedNumber[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    output.push({ path, value });
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      flattenToolNumbers(entry, `${path}[${index}]`, output);
    });
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      flattenToolNumbers(entry, nextPath, output);
    }
  }

  return output;
}

function flattenToolDates(
  value: unknown,
  path: string = "",
  output: FlattenedDate[] = [],
): FlattenedDate[] {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      output.push({ path, value });
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      flattenToolDates(entry, `${path}[${index}]`, output);
    });
    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      flattenToolDates(entry, nextPath, output);
    }
  }

  return output;
}

function collectToolNumbers(toolResults: AgentToolResultRecord[]): FlattenedNumber[] {
  return toolResults.flatMap((record) =>
    record.success ? flattenToolNumbers(record.parsedContent) : [],
  );
}

function collectToolDates(toolResults: AgentToolResultRecord[]): FlattenedDate[] {
  return toolResults.flatMap((record) =>
    record.success ? flattenToolDates(record.parsedContent) : [],
  );
}

function answerMentionsCurrentSubject(auditCase: AuditCase, answer: string): boolean {
  const tokens: string[] = [];
  if (auditCase.request.ticker) {
    tokens.push(auditCase.request.ticker.toUpperCase());
  }

  if (auditCase.request.country === "us") {
    tokens.push("UNITED STATES", "U.S.", "US");
  } else if (auditCase.request.country === "fr") {
    tokens.push("FRANCE", "FRENCH");
  }

  if (auditCase.request.crypto_instrument === "BTC-PERPETUAL") {
    tokens.push("BTC", "BITCOIN", "BTC-PERPETUAL");
  } else if (auditCase.request.crypto_instrument === "ETH-PERPETUAL") {
    tokens.push("ETH", "ETHEREUM", "ETH-PERPETUAL");
  }

  if (auditCase.request.commodity_instrument) {
    tokens.push(
      auditCase.request.commodity_instrument.replace(/-/g, " ").toUpperCase(),
      auditCase.request.commodity_instrument.toUpperCase(),
    );
  }

  if (tokens.length === 0) {
    return true;
  }

  const normalizedAnswer = answer.toUpperCase();
  return tokens.some((token) => normalizedAnswer.includes(token));
}

function normalizeCompactNumber(raw: string): number | null {
  const normalized = normalizeAnswerText(raw).replace(/[()]/g, "").trim();
  const negative = normalized.startsWith("-") || normalized.startsWith("$-");
  const cleaned = normalized.replace(/[$,%-]/g, "").replace(/,/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const suffix = cleaned.at(-1)?.toUpperCase();
  const multiplier =
    suffix === "K"
      ? 1_000
      : suffix === "M"
        ? 1_000_000
        : suffix === "B"
          ? 1_000_000_000
          : suffix === "T"
            ? 1_000_000_000_000
            : 1;
  const numeric = suffix && multiplier !== 1 ? cleaned.slice(0, -1) : cleaned;
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const value = parsed * multiplier;
  return negative ? -value : value;
}

function approximateDerivedAbsoluteMatch(
  answerValue: number,
  toolNumbers: FlattenedNumber[],
): boolean {
  const candidates = toolNumbers
    .filter((entry) => !/(date|timestamp)/i.test(entry.path))
    .map((entry) => entry.value)
    .filter((value) => Number.isFinite(value))
    .slice(0, 64);

  for (let index = 0; index < candidates.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < candidates.length; compareIndex += 1) {
      const difference = Math.abs(candidates[index] - candidates[compareIndex]);
      const tolerance = Math.max(0.25, difference * 0.15);
      if (Math.abs(Math.abs(answerValue) - difference) <= tolerance) {
        return true;
      }
    }
  }

  return false;
}

function shouldIgnoreNumericMention(answer: string, raw: string, index: number): boolean {
  const normalizedAnswer = normalizeAnswerText(answer);
  const end = index + raw.length;
  const nextChar = normalizedAnswer[end] ?? "";
  const nextSlice = normalizedAnswer.slice(end, end + 16);
  const around = normalizedAnswer
    .slice(Math.max(0, index - 8), Math.min(normalizedAnswer.length, end + 16))
    .toLowerCase();
  const contextWindow = normalizedAnswer
    .slice(Math.max(0, index - 32), Math.min(normalizedAnswer.length, end + 32))
    .toLowerCase();
  const localMathWindow = normalizedAnswer.slice(
    Math.max(0, index - 4),
    Math.min(normalizedAnswer.length, end + 4),
  );
  const compactRaw = normalizeAnswerText(raw)
    .replace(/[()$,%\s-]/g, "")
    .replace(/,/g, "");

  if (/^\d{1,2},$/.test(raw.trim())) {
    return true;
  }

  if (/^\d{4}[.,]?$/.test(raw.trim())) {
    return true;
  }

  if (/^\d{4}$/.test(compactRaw)) {
    return true;
  }

  if (/\d{4}-\d{2}-\d{2}/.test(around)) {
    return true;
  }

  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i.test(contextWindow)) {
    return true;
  }

  if (/[a-z]/i.test(nextChar) && !/[kmbt]/i.test(nextChar)) {
    return true;
  }

  if (/^\s*-\s*(day|days|week|weeks|month|months|year|years|yr|yrs|hour|hours|hr|hrs)\b/i.test(nextSlice)) {
    return true;
  }

  if (/\b(calculated|formula)\b/.test(contextWindow) && /[×/*=]/.test(contextWindow)) {
    return true;
  }

  if (/[×/=]/.test(localMathWindow)) {
    return true;
  }

  return false;
}

function extractAnswerNumericMentions(answer: string): Array<{ raw: string; value: number }> {
  const matches = answer.matchAll(/(?:-\$?|\$?-?)\d[\d,.]*(?:\.\d+)?(?:[KMBTkmbt])?%?/g);
  const mentions: Array<{ raw: string; value: number }> = [];

  for (const match of matches) {
    const raw = match[0];
    const index = match.index ?? 0;

    if (shouldIgnoreNumericMention(answer, raw, index)) {
      continue;
    }

    const value = normalizeCompactNumber(raw);
    if (value == null) {
      continue;
    }

    mentions.push({ raw, value });
  }

  return mentions;
}

function approximateMatch(answerValue: number, toolValue: number): boolean {
  const directDelta = Math.abs(answerValue - toolValue);
  const scaledDelta = Math.abs(answerValue - toolValue * 100);
  const directTolerance = Math.max(0.25, Math.abs(toolValue) * 0.15);
  const scaledTolerance = Math.max(0.25, Math.abs(toolValue * 100) * 0.15);
  return directDelta <= directTolerance || scaledDelta <= scaledTolerance;
}

function approximateDerivedPercentageMatch(
  answerValue: number,
  toolNumbers: FlattenedNumber[],
): boolean {
  const candidates = toolNumbers
    .filter((entry) => !/(date|timestamp)/i.test(entry.path))
    .map((entry) => Math.abs(entry.value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 64);

  for (let index = 0; index < candidates.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < candidates.length; compareIndex += 1) {
      const left = candidates[index];
      const right = candidates[compareIndex];
      if (right === 0 || left === 0) {
        continue;
      }

      const percentages = [
        Math.abs((left - right) / right) * 100,
        Math.abs((right - left) / left) * 100,
      ];

      if (
        percentages.some((candidate) =>
          Math.abs(Math.abs(answerValue) - candidate) <= Math.max(0.5, candidate * 0.15),
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function findInfraMessages(
  transcript: AuditTranscriptEvent[],
  toolResults: AgentToolResultRecord[],
): string[] {
  const transcriptMessages = transcript.flatMap((event) =>
    event.event === "error" && typeof event.data.message === "string"
      ? [event.data.message]
      : [],
  );
  const toolMessages = toolResults.flatMap((result) =>
    !result.success && result.error ? [result.error] : [],
  );
  return [...transcriptMessages, ...toolMessages];
}

function isInfraMessage(message: string): boolean {
  return /\b(timeout|timed out|upstream|unavailable|request failed|failed|not configured|abort)\b/i.test(
    message,
  );
}

export function isRetryableInfraFinding(findings: AuditFinding[]): boolean {
  return findings.some(
    (finding) =>
      finding.level === "blocked" &&
      !finding.evidence.some((entry) => /not configured/i.test(entry)),
  );
}

export function parseSseChunk(rawChunk: string): AuditTranscriptEvent[] {
  return rawChunk
    .split("\n\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const lines = part.split("\n");
      let event = "";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          event = line.slice(7);
        } else if (line.startsWith("data: ")) {
          data += line.slice(6);
        }
      }

      if (!event || !data) {
        return [];
      }

      try {
        return [{
          event,
          data: JSON.parse(data) as Record<string, unknown>,
          raw: `${part}\n\n`,
        }];
      } catch {
        return [];
      }
    });
}

function evaluateToolExpectations(
  auditCase: AuditCase,
  toolCalls: AgentToolCallRecord[],
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const names = new Set(toolCalls.map((record) => record.name));
  const expectsTools =
    (auditCase.requiredTools?.length ?? 0) > 0 ||
    (auditCase.requiredAnyTools?.length ?? 0) > 0;

  if (toolCalls.length === 0) {
    if (!expectsTools) {
      return findings;
    }

    findings.push(
      createFinding({
        level: "hard",
        severity: "high",
        category: "missing_required_tool",
        message: "The agent produced no tool calls.",
        evidence: ["No tool_call events were observed."],
      }),
    );
    return findings;
  }

  for (const requiredTool of auditCase.requiredTools ?? []) {
    if (!names.has(requiredTool)) {
      findings.push(
        createFinding({
          level: "hard",
          severity: "high",
          category: "missing_required_tool",
          message: `Expected tool ${requiredTool} was not used.`,
          evidence: [`Observed tools: ${Array.from(names).join(", ") || "none"}`],
        }),
      );
    }
  }

  if (
    auditCase.requiredAnyTools &&
    !auditCase.requiredAnyTools.some((tool) => names.has(tool))
  ) {
    findings.push(
      createFinding({
        level: "hard",
        severity: "high",
        category: "missing_required_tool",
        message: "None of the expected alternative tools were used.",
        evidence: [
          `Expected one of: ${auditCase.requiredAnyTools.join(", ")}`,
          `Observed tools: ${Array.from(names).join(", ") || "none"}`,
        ],
      }),
    );
  }

  for (const forbiddenTool of auditCase.forbiddenTools ?? []) {
    if (names.has(forbiddenTool)) {
      findings.push(
        createFinding({
          level: "hard",
          severity: "high",
          category: "forbidden_tool_usage",
          message: `Forbidden tool ${forbiddenTool} was used.`,
          evidence: [`Observed tools: ${Array.from(names).join(", ")}`],
        }),
      );
    }
  }

  return findings;
}

function evaluateDownloadExpectation(
  auditCase: AuditCase,
  displayDownload: Record<string, unknown> | null,
): AuditFinding[] {
  if (auditCase.downloadExpectation === "required" && displayDownload == null) {
    return [
      createFinding({
        level: "hard",
        severity: "high",
        category: "hallucinated_export_or_capability",
        message: "The case required a download handoff, but no display_download event was emitted.",
        evidence: ["No display_download event was observed."],
      }),
    ];
  }

  if (auditCase.downloadExpectation === "forbidden" && displayDownload != null) {
    return [
      createFinding({
        level: "hard",
        severity: "high",
        category: "hallucinated_export_or_capability",
        message: "The agent emitted a download handoff where none should appear.",
        evidence: [JSON.stringify(displayDownload)],
      }),
    ];
  }

  return [];
}

function evaluateAnswerPatterns(
  auditCase: AuditCase,
  finalAnswer: string,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!finalAnswer.trim()) {
    findings.push(
      createFinding({
        level: "hard",
        severity: "high",
        category: "question_not_answered",
        message: "The agent produced no final answer text.",
        evidence: ["Final answer was empty."],
      }),
    );
    return findings;
  }

  for (const check of auditCase.requiredAnswerChecks ?? []) {
    if (!testPattern(check.pattern, finalAnswer)) {
      findings.push(
        createFinding({
          level: check.level ?? "soft",
          severity: check.severity ?? "medium",
          category: check.category,
          message: check.message,
          evidence: [`Final answer: ${finalAnswer.slice(0, 240)}`],
        }),
      );
    }
  }

  for (const check of auditCase.forbiddenAnswerChecks ?? []) {
    if (testPattern(check.pattern, finalAnswer)) {
      findings.push(
        createFinding({
          level: check.level ?? "hard",
          severity: check.severity ?? "high",
          category: check.category,
          message: check.message,
          evidence: [`Final answer: ${finalAnswer.slice(0, 240)}`],
          answerExcerpt: extractAnswerExcerpt(finalAnswer, check.pattern),
        }),
      );
    }
  }

  if (
    auditCase.answerMustReferenceCurrentSubject &&
    !answerMentionsCurrentSubject(auditCase, finalAnswer)
  ) {
    findings.push(
      createFinding({
        level: "soft",
        severity: "medium",
        category: auditCase.context === "macro" ? "wrong_country" : "wrong_context",
        message: "The answer did not clearly reference the current dashboard subject.",
        evidence: [`Final answer: ${finalAnswer.slice(0, 240)}`],
      }),
    );
  }

  return findings;
}

function evaluateNumericGrounding(
  auditCase: AuditCase,
  finalAnswer: string,
  toolResults: AgentToolResultRecord[],
): AuditFinding[] {
  if (auditCase.numericGrounding !== "strict") {
    return [];
  }

  const answerNumbers = extractAnswerNumericMentions(finalAnswer);
  if (answerNumbers.length === 0) {
    return [];
  }

  const toolNumbers = collectToolNumbers(toolResults);
  if (toolNumbers.length === 0) {
    return [
      createFinding({
        level: "hard",
        severity: "high",
        category: "unsupported_claim",
        message: "The answer cites figures, but no successful tool output exposed numeric data to ground them.",
        evidence: [`Answer figures: ${answerNumbers.map((entry) => entry.raw).join(", ")}`],
        answerExcerpt: extractAnswerExcerpt(finalAnswer, answerNumbers[0]?.raw ?? ""),
      }),
    ];
  }

  const unmatched = answerNumbers.filter(
    (entry) =>
      !toolNumbers.some((toolNumber) => approximateMatch(entry.value, toolNumber.value)) &&
      !(entry.raw.includes("%") && approximateDerivedPercentageMatch(entry.value, toolNumbers)) &&
      !approximateDerivedAbsoluteMatch(entry.value, toolNumbers),
  );

  if (unmatched.length === 0) {
    return [];
  }

  return [
    createFinding({
      level: "hard",
      severity: "high",
      category: "contradicted_by_tool_output",
      message: "Some figures in the final answer could not be reconciled with the observed tool output.",
      evidence: [
        `Unmatched answer figures: ${unmatched.map((entry) => entry.raw).join(", ")}`,
        `Sample tool numbers: ${toolNumbers.slice(0, 12).map((entry) => `${entry.path}=${entry.value}`).join(", ")}`,
      ],
      answerExcerpt: extractAnswerExcerpt(finalAnswer, unmatched[0]?.raw ?? ""),
    }),
  ];
}

function evaluateTemporalSafety(
  finalAnswer: string,
  toolCalls: AgentToolCallRecord[],
  toolResults: AgentToolResultRecord[],
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const toolNames = new Set(toolCalls.map((record) => record.name));
  const dates = collectToolDates(toolResults);
  const today = new Date().toISOString().slice(0, 10);

  if (
    UNSAFE_TIME_WORDS.test(finalAnswer) &&
    toolNames.has("get_macro_snapshot")
  ) {
    const latestMacroDate = dates
      .filter((entry) => entry.path.endsWith("latest_date"))
      .map((entry) => entry.value.slice(0, 10))
      .sort()
      .at(-1);

    if (latestMacroDate && latestMacroDate !== today) {
      findings.push(
        createFinding({
          level: "hard",
          severity: "high",
          category: "stale_or_time_unsafe_answer",
          message: "The answer uses current/today wording even though the macro data dates are older than today.",
          evidence: [`Latest macro date observed: ${latestMacroDate}`, `Today: ${today}`],
          answerExcerpt: extractAnswerExcerpt(finalAnswer, UNSAFE_TIME_WORDS),
        }),
      );
    }
  }

  const newsExcerpt = extractAnswerExcerpt(finalAnswer, NEWS_RECENCY_WORDS);
  if (
    newsExcerpt &&
    NEWS_RECENCY_WORDS.test(newsExcerpt) &&
    !NEGATED_CAPABILITY_WORDS.test(newsExcerpt) &&
    !toolNames.has("get_news") &&
    !toolNames.has("get_context_news")
  ) {
    findings.push(
      createFinding({
        level: "hard",
        severity: "high",
        category: "unsupported_claim",
        message: "The answer discusses recent headlines without using the news tool.",
        evidence: [`Observed tools: ${Array.from(toolNames).join(", ") || "none"}`],
        answerExcerpt: newsExcerpt,
      }),
    );
  }

  const filingsExcerpt = extractAnswerExcerpt(finalAnswer, FILINGS_RECENCY_WORDS);
  if (
    filingsExcerpt &&
    FILINGS_RECENCY_WORDS.test(filingsExcerpt) &&
    !NEGATED_CAPABILITY_WORDS.test(filingsExcerpt) &&
    !toolNames.has("get_sec_filings")
  ) {
    findings.push(
      createFinding({
        level: "hard",
        severity: "high",
        category: "unsupported_claim",
        message: "The answer references a latest filing without using the filings tool.",
        evidence: [`Observed tools: ${Array.from(toolNames).join(", ") || "none"}`],
        answerExcerpt: filingsExcerpt,
      }),
    );
  }

  return findings;
}

function evaluateInfraState(
  transcript: AuditTranscriptEvent[],
  toolResults: AgentToolResultRecord[],
  finalAnswer: string,
): AuditFinding[] {
  const messages = findInfraMessages(transcript, toolResults);
  if (messages.length === 0 || finalAnswer.trim()) {
    return [];
  }

  const infraMessages = messages.filter(isInfraMessage);
  if (infraMessages.length === 0) {
    return [];
  }

  return [
    createFinding({
      level: "blocked",
      severity: "high",
      category: "infra_blocked",
      message: "The case was blocked by infrastructure or upstream failures before a usable answer was produced.",
      evidence: infraMessages,
    }),
  ];
}

function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = JSON.stringify([
      finding.level,
      finding.severity,
      finding.category,
      finding.message,
      finding.answerExcerpt,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function deriveStatus(findings: AuditFinding[]): AuditStatus {
  if (findings.some((finding) => finding.level === "hard")) {
    return "hard_fail";
  }

  if (findings.some((finding) => finding.level === "soft")) {
    return "soft_fail";
  }

  if (findings.some((finding) => finding.level === "blocked")) {
    return "blocked";
  }

  return "pass";
}

export function evaluateAuditCase(
  auditCase: AuditCase,
  input: EvaluationInput,
): { status: AuditStatus; findings: AuditFinding[] } {
  const infraFindings = evaluateInfraState(
    input.transcript,
    input.toolResults,
    input.finalAnswer,
  );

  const shouldShortCircuitForInfra =
    infraFindings.length > 0 && !input.finalAnswer.trim();

  const findings = dedupeFindings(
    shouldShortCircuitForInfra
      ? infraFindings
      : [
          ...evaluateToolExpectations(auditCase, input.toolCalls),
          ...evaluateDownloadExpectation(auditCase, input.displayDownload),
          ...evaluateAnswerPatterns(auditCase, input.finalAnswer),
          ...evaluateNumericGrounding(auditCase, input.finalAnswer, input.toolResults),
          ...evaluateTemporalSafety(input.finalAnswer, input.toolCalls, input.toolResults),
          ...infraFindings,
        ],
  );

  return {
    status: deriveStatus(findings),
    findings,
  };
}
