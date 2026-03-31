import type {
  AuditCaseResult,
  AuditFinding,
  AuditRunResult,
} from "@/server/agent/audit/types";

const CATEGORY_LABELS: Record<AuditFinding["category"], string> = {
  wrong_context: "Wrong context",
  wrong_asset: "Wrong asset",
  wrong_country: "Wrong country",
  wrong_instrument: "Wrong instrument",
  missing_required_tool: "Missing required tool",
  forbidden_tool_usage: "Forbidden tool usage",
  unsupported_claim: "Unsupported claim",
  contradicted_by_tool_output: "Contradicted by tool output",
  stale_or_time_unsafe_answer: "Stale or time-unsafe answer",
  hallucinated_export_or_capability: "Wrong export or capability claim",
  question_not_answered: "Question not answered",
  partial_answer: "Partial answer",
  infra_blocked: "Infrastructure blocked",
};

function toolSummary(result: AuditCaseResult): string {
  const toolNames = result.toolCalls.map((entry) => entry.name);
  return toolNames.length > 0 ? toolNames.join(", ") : "none";
}

function summarizeStatuses(results: AuditCaseResult[]) {
  return results.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    {
      pass: 0,
      soft_fail: 0,
      hard_fail: 0,
      blocked: 0,
    },
  );
}

function summarizeByContext(results: AuditCaseResult[]) {
  return new Map(
    ["stock", "macro", "commodity", "crypto", "data"].map((context) => [
      context,
      summarizeStatuses(results.filter((result) => result.context === context)),
    ]),
  );
}

function summarizeRecurringIssues(results: AuditCaseResult[]) {
  const counts = new Map<string, number>();

  for (const result of results) {
    for (const finding of result.findings) {
      const label = CATEGORY_LABELS[finding.category];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function sortCases(results: AuditCaseResult[]): AuditCaseResult[] {
  const statusOrder: Record<AuditCaseResult["status"], number> = {
    hard_fail: 0,
    soft_fail: 1,
    blocked: 2,
    pass: 3,
  };

  return [...results].sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return a.caseId.localeCompare(b.caseId);
  });
}

function renderCaseFinding(result: AuditCaseResult, finding: AuditFinding): string {
  const lines = [
    `### ${result.caseId} — ${result.label}`,
    ``,
    `- Status: \`${result.status}\``,
    `- Context: \`${result.context}\``,
    `- Prompt: ${result.request.query}`,
    `- Tools: ${toolSummary(result)}`,
    `- Finding: ${finding.message}`,
  ];

  if (finding.answerExcerpt) {
    lines.push(`- Wrong answer excerpt: "${finding.answerExcerpt}"`);
  }

  if (finding.evidence.length > 0) {
    lines.push(`- Evidence: ${finding.evidence.join(" | ")}`);
  }

  lines.push("");
  return lines.join("\n");
}

function renderFindingSection(
  title: string,
  results: AuditCaseResult[],
  categories: AuditFinding["category"][],
): string {
  const sections: string[] = [`## ${title}`, ""];
  const matching = sortCases(results).flatMap((result) =>
    result.findings
      .filter((finding) => categories.includes(finding.category))
      .map((finding) => renderCaseFinding(result, finding)),
  );

  if (matching.length === 0) {
    sections.push("No findings in this category.", "");
    return sections.join("\n");
  }

  sections.push(...matching);
  return sections.join("\n");
}

export function buildAuditReport(runResult: AuditRunResult): string {
  const results = sortCases(runResult.cases);
  const totals = summarizeStatuses(results);
  const byContext = summarizeByContext(results);
  const recurring = summarizeRecurringIssues(results).slice(0, 10);

  const lines: string[] = [
    "# Frontend Agent Audit Report",
    "",
    "## Environment Summary",
    "",
    `- Model: \`${runResult.model}\``,
    `- Started: ${runResult.startedAt}`,
    `- Finished: ${runResult.finishedAt}`,
    `- Duration: ${Math.round(runResult.durationMs / 1000)}s`,
    `- Total cases: ${runResult.cases.length}`,
    `- Blocked cases: ${totals.blocked}`,
    "",
    "## Scoreboard",
    "",
    `- Pass: ${totals.pass}`,
    `- Soft fail: ${totals.soft_fail}`,
    `- Hard fail: ${totals.hard_fail}`,
    `- Blocked: ${totals.blocked}`,
    "",
    "### By Context",
    "",
  ];

  for (const [context, summary] of byContext.entries()) {
    lines.push(
      `- ${context}: pass ${summary.pass}, soft fail ${summary.soft_fail}, hard fail ${summary.hard_fail}, blocked ${summary.blocked}`,
    );
  }

  lines.push("", "## Top Recurring Issues", "");

  if (recurring.length === 0) {
    lines.push("No recurring issues found.", "");
  } else {
    for (const [label, count] of recurring) {
      lines.push(`- ${label}: ${count}`);
    }
    lines.push("");
  }

  lines.push(
    renderFindingSection("Wrong Answers", results, [
      "unsupported_claim",
      "contradicted_by_tool_output",
      "question_not_answered",
      "partial_answer",
    ]),
    renderFindingSection("Context Failures", results, [
      "wrong_context",
      "wrong_asset",
      "wrong_country",
      "wrong_instrument",
    ]),
    renderFindingSection("Stale Or Time-Unsafe Answers", results, [
      "stale_or_time_unsafe_answer",
    ]),
    renderFindingSection("Handoff And Export Failures", results, [
      "hallucinated_export_or_capability",
    ]),
    renderFindingSection("Tool Path Failures", results, [
      "missing_required_tool",
      "forbidden_tool_usage",
      "infra_blocked",
    ]),
  );

  return lines.join("\n");
}
