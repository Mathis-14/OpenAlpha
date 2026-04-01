import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  probeBroadNewsThemes,
  type BroadNewsProbeResult,
} from "./broad.ts";

export function renderBroadNewsProbeReport(
  result: BroadNewsProbeResult,
): string {
  const lines: string[] = [
    "# Broad News Probe Report",
    "",
    `Generated: ${result.generated_at}`,
    "",
    `Providers: ${result.providers.join(", ")}`,
    "",
  ];

  for (const theme of result.themes) {
    lines.push(`## ${theme.theme_label}`);
    lines.push("");
    lines.push(
      `Winner: \`${theme.winner.query}\` via \`${theme.winner.provider}\` / \`${theme.winner.source_mode}\` (${theme.winner.outcome}, score ${theme.winner.score})`,
    );
    lines.push("");

    if (theme.warnings?.length) {
      for (const warning of theme.warnings) {
        lines.push(`Warning: ${warning}`);
      }
      lines.push("");
    }

    lines.push("| Query | Provider | Source Mode | Outcome | Score | Articles | Reason |");
    lines.push("| --- | --- | --- | --- | ---: | ---: | --- |");
    for (const attempt of theme.attempts) {
      lines.push(
        `| ${attempt.query} | ${attempt.provider} | ${attempt.source_mode} | ${attempt.outcome} | ${attempt.score} | ${attempt.article_count} | ${attempt.reason} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeBroadNewsProbeArtifacts(
  result: BroadNewsProbeResult,
): Promise<{
  reportPath: string;
  jsonPath: string;
}> {
  const docsDir = resolve(process.cwd(), "../docs");
  const reportPath = resolve(docsDir, "broad-news-probe-report.local.md");
  const jsonPath = resolve(docsDir, "broad-news-probe-results.local.json");

  await mkdir(docsDir, { recursive: true });
  await writeFile(reportPath, renderBroadNewsProbeReport(result), "utf8");
  await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8");

  return {
    reportPath,
    jsonPath,
  };
}

async function main(): Promise<void> {
  const result = await probeBroadNewsThemes();
  const artifacts = await writeBroadNewsProbeArtifacts(result);

  process.stdout.write(`${renderBroadNewsProbeReport(result)}\n`);
  process.stdout.write(`\nWrote report: ${artifacts.reportPath}\n`);
  process.stdout.write(`Wrote json: ${artifacts.jsonPath}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
