import type { AgentRequest } from "@/types/api";
import type {
  AgentToolCallRecord,
  AgentToolResultRecord,
} from "@/server/agent/service";

export type AuditContext =
  | "stock"
  | "macro"
  | "commodity"
  | "crypto"
  | "data";

export type AuditStatus = "pass" | "soft_fail" | "hard_fail" | "blocked";

export type AuditFindingLevel = "soft" | "hard" | "blocked";
export type AuditFindingSeverity = "low" | "medium" | "high";

export type AuditFindingCategory =
  | "wrong_context"
  | "wrong_asset"
  | "wrong_country"
  | "wrong_instrument"
  | "missing_required_tool"
  | "forbidden_tool_usage"
  | "unsupported_claim"
  | "contradicted_by_tool_output"
  | "stale_or_time_unsafe_answer"
  | "hallucinated_export_or_capability"
  | "question_not_answered"
  | "partial_answer"
  | "infra_blocked";

export type DownloadExpectation = "required" | "optional" | "forbidden";

export type ToolName =
  | "get_stock_overview"
  | "get_stock_fundamentals"
  | "get_price_history"
  | "get_macro_snapshot"
  | "get_macro_series"
  | "suggest_data_export"
  | "get_commodity_overview"
  | "get_commodity_price_history"
  | "get_crypto_overview"
  | "get_crypto_price_history"
  | "get_sec_filings"
  | "get_news"
  | "get_context_news";

export type AuditTextExpectation = {
  pattern: RegExp;
  message: string;
  category: AuditFindingCategory;
  level?: AuditFindingLevel;
  severity?: AuditFindingSeverity;
};

export type AuditCase = {
  id: string;
  label: string;
  context: AuditContext;
  request: AgentRequest;
  requiredTools?: ToolName[];
  requiredAnyTools?: ToolName[];
  forbiddenTools?: ToolName[];
  requiredAnswerChecks?: AuditTextExpectation[];
  forbiddenAnswerChecks?: AuditTextExpectation[];
  downloadExpectation?: DownloadExpectation;
  answerMustReferenceCurrentSubject?: boolean;
  numericGrounding?: "strict" | "off";
  notes?: string;
  exploratory?: boolean;
  allowRetryOnInfra?: boolean;
};

export type AuditTranscriptEvent = {
  event: string;
  data: Record<string, unknown>;
  raw: string;
};

export type AuditFinding = {
  level: AuditFindingLevel;
  severity: AuditFindingSeverity;
  category: AuditFindingCategory;
  message: string;
  evidence: string[];
  answerExcerpt?: string;
};

export type AuditCaseResult = {
  caseId: string;
  label: string;
  context: AuditContext;
  request: AgentRequest;
  model: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attempts: number;
  status: AuditStatus;
  transcript: AuditTranscriptEvent[];
  toolCalls: AgentToolCallRecord[];
  toolResults: AgentToolResultRecord[];
  finalAnswer: string;
  displayDownload: Record<string, unknown> | null;
  findings: AuditFinding[];
};

export type AuditRunResult = {
  model: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  cases: AuditCaseResult[];
};
