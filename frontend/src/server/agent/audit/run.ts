import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import nextEnv from "@next/env";
import {
  AGENT_AUDIT_CASES,
} from "@/server/agent/audit/cases";
import {
  evaluateAuditCase,
  isRetryableInfraFinding,
  parseSseChunk,
} from "@/server/agent/audit/evaluator";
import { buildAuditReport } from "@/server/agent/audit/report";
import type {
  AuditCase,
  AuditCaseResult,
  AuditRunResult,
} from "@/server/agent/audit/types";
import {
  type AgentRunObserver,
  type AgentToolCallRecord,
  type AgentToolResultRecord,
  runAgent,
} from "@/server/agent/service";

type CliOptions = {
  context?: string;
  caseId?: string;
  limit?: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../../../");
const DOCS_DIR = path.resolve(__dirname, "../../../../../docs");
const JSON_REPORT_PATH = path.join(DOCS_DIR, "agent-audit-results.local.json");
const MD_REPORT_PATH = path.join(DOCS_DIR, "agent-audit-report.local.md");
const { loadEnvConfig } = nextEnv;

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (const arg of argv) {
    if (arg.startsWith("--context=")) {
      options.context = arg.slice("--context=".length).trim();
    } else if (arg.startsWith("--case=")) {
      options.caseId = arg.slice("--case=".length).trim();
    } else if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
  }

  return options;
}

function selectCases(options: CliOptions): AuditCase[] {
  let cases = AGENT_AUDIT_CASES;

  if (options.context) {
    cases = cases.filter((auditCase) => auditCase.context === options.context);
  }

  if (options.caseId) {
    cases = cases.filter((auditCase) => auditCase.id === options.caseId);
  }

  if (options.limit != null) {
    cases = cases.slice(0, options.limit);
  }

  return cases;
}

function getModelName(): string {
  const model = process.env.MISTRAL_MODEL?.trim();
  return model || "mistral-small-latest";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runCaseOnce(
  auditCase: AuditCase,
  model: string,
  attempt: number,
): Promise<AuditCaseResult> {
  const started = new Date();
  const transcript = [];
  const toolCalls: AgentToolCallRecord[] = [];
  const toolResults: AgentToolResultRecord[] = [];
  let finalAnswer = "";
  let displayDownload: Record<string, unknown> | null = null;

  const observer: AgentRunObserver = {
    onToolCall(record) {
      toolCalls.push(record);
    },
    onToolResult(record) {
      toolResults.push(record);
    },
  };

  for await (const rawChunk of runAgent(auditCase.request, observer)) {
    const events = parseSseChunk(rawChunk);
    transcript.push(...events);
    for (const event of events) {
      if (
        event.event === "text_delta" &&
        typeof event.data.content === "string"
      ) {
        finalAnswer += event.data.content;
      }

      if (event.event === "display_download") {
        displayDownload = event.data;
      }
    }
  }

  const finished = new Date();
  const evaluated = evaluateAuditCase(auditCase, {
    transcript,
    toolCalls,
    toolResults,
    finalAnswer,
    displayDownload,
  });

  return {
    caseId: auditCase.id,
    label: auditCase.label,
    context: auditCase.context,
    request: auditCase.request,
    model,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    attempts: attempt,
    status: evaluated.status,
    transcript,
    toolCalls,
    toolResults,
    finalAnswer,
    displayDownload,
    findings: evaluated.findings,
  };
}

async function runCaseWithRetry(
  auditCase: AuditCase,
  model: string,
): Promise<AuditCaseResult> {
  const firstAttempt = await runCaseOnce(auditCase, model, 1);
  if (
    !auditCase.allowRetryOnInfra ||
    firstAttempt.status !== "blocked" ||
    !isRetryableInfraFinding(firstAttempt.findings)
  ) {
    return firstAttempt;
  }

  console.log(`Retrying ${auditCase.id} after infra failure...`);
  await delay(400);
  const secondAttempt = await runCaseOnce(auditCase, model, 2);
  return secondAttempt;
}

function printCaseSummary(result: AuditCaseResult, index: number, total: number) {
  const topFinding = result.findings[0];
  const findingText = topFinding ? ` — ${topFinding.category}: ${topFinding.message}` : "";
  console.log(
    `[${index}/${total}] ${result.caseId} ${result.status} (${Math.round(result.durationMs / 1000)}s)${findingText}`,
  );
}

async function writeArtifacts(runResult: AuditRunResult) {
  await mkdir(DOCS_DIR, { recursive: true });
  await writeFile(JSON_REPORT_PATH, `${JSON.stringify(runResult, null, 2)}\n`, "utf8");
  await writeFile(MD_REPORT_PATH, `${buildAuditReport(runResult)}\n`, "utf8");
}

async function main() {
  loadEnvConfig(FRONTEND_ROOT);
  const options = parseCliOptions(process.argv.slice(2));
  const cases = selectCases(options);
  const model = getModelName();

  if (cases.length === 0) {
    throw new Error("No audit cases selected.");
  }

  console.log(`Running frontend agent audit with model ${model}`);
  console.log(`Selected ${cases.length} case(s).`);

  const runStarted = new Date();
  const results: AuditCaseResult[] = [];

  for (const [index, auditCase] of cases.entries()) {
    console.log(`\nRunning ${auditCase.id}: ${auditCase.label}`);
    const result = await runCaseWithRetry(auditCase, model);
    results.push(result);
    printCaseSummary(result, index + 1, cases.length);
    await delay(150);
  }

  const runFinished = new Date();
  const runResult: AuditRunResult = {
    model,
    startedAt: runStarted.toISOString(),
    finishedAt: runFinished.toISOString(),
    durationMs: runFinished.getTime() - runStarted.getTime(),
    cases: results,
  };

  await writeArtifacts(runResult);

  const summary = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { pass: 0, soft_fail: 0, hard_fail: 0, blocked: 0 },
  );

  console.log("\nAudit complete.");
  console.log(`Pass: ${summary.pass}`);
  console.log(`Soft fail: ${summary.soft_fail}`);
  console.log(`Hard fail: ${summary.hard_fail}`);
  console.log(`Blocked: ${summary.blocked}`);
  console.log(`JSON report: ${JSON_REPORT_PATH}`);
  console.log(`Markdown report: ${MD_REPORT_PATH}`);
}

await main();
