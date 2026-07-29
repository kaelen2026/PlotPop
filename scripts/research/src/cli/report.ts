import { join } from "node:path";
import { parseHarnessConfig } from "../config.js";
import { openAttemptLog } from "../records/log.js";
import { projectEpisodeCostUsd, summarizeRun } from "../stats/economics.js";
import type { Summary } from "../stats/percentiles.js";
import { midnightNoodleRun } from "../testset/midnight-noodle-run.js";

/**
 * `pnpm --filter @plotpop/research-harness report`
 *
 * Prints the figures `docs/research/unit-economics.md` has blanks for. It prints
 * "not measured" rather than a zero wherever the run has nothing to say, because a
 * zero in that table would be copied across as a measurement.
 */

const notMeasured = "not measured";

function money(value: number | null): string {
  return value === null ? notMeasured : `$${value.toFixed(4)}`;
}

function seconds(value: number | null): string {
  return value === null ? notMeasured : `${(value / 1000).toFixed(1)}s`;
}

function line(label: string, value: string): string {
  return `  ${label.padEnd(46)}${value}`;
}

function describe(label: string, summary: Summary | null, format: (value: number) => string) {
  if (summary === null) return [line(label, notMeasured)];

  return [
    line(`${label} p50`, format(summary.p50)),
    line(`${label} p95`, format(summary.p95)),
    line(`${label} max`, format(summary.max)),
  ];
}

async function main() {
  const config = parseHarnessConfig(process.env);
  const runDirectory = join(config.runDir, config.runId);
  const records = await (await openAttemptLog(runDirectory)).all();
  const report = summarizeRun(
    records,
    midnightNoodleRun.shots.map((shot) => shot.id),
  );

  const perShotCost = report.costUsd.perResolvedShot;

  const lines = [
    "",
    `F-00 run ${config.runId} — ${config.provider}${config.model === null ? "" : ` / ${config.model}`}`,
    `test set ${midnightNoodleRun.id}, frozen ${midnightNoodleRun.frozenOn}, tier ${config.tier}`,
    "",
    "Coverage",
    line("shots in the frozen set", String(report.plannedShotCount)),
    line("shots attempted", String(report.attemptedShotCount)),
    line("attempts logged", String(report.attemptCount)),
    line("shots with no usable version", String(report.unresolvedShotIds.length)),
    "",
    "Gate inputs",
    line(
      "first-pass shots (Gate A needs 23)",
      `${report.firstPassShotCount} of ${report.plannedShotCount} = ${(report.firstPassRate * 100).toFixed(1)}%`,
    ),
    line(
      "unresolved after the budget (Gate B needs 0)",
      report.unresolvedShotIds.length === 0 ? "0" : report.unresolvedShotIds.join(", "),
    ),
    "",
    "Latency",
    ...describe("generation per attempt", report.generateLatencyMs, (value) => seconds(value)),
    ...describe("wall clock per shot", report.shotWallClockMs, (value) => seconds(value)),
    "",
    "Cost",
    line("total", money(report.costUsd.total)),
    line("spent on failed attempts", money(report.costUsd.onFailedAttempts)),
    ...describe("per resolved shot", perShotCost, (value) => money(value)),
    line("per finished minute", money(report.costUsd.perAcceptedMinute)),
    line(
      "accepted footage",
      report.acceptedOutputSeconds === 0
        ? notMeasured
        : `${report.acceptedOutputSeconds.toFixed(2)}s`,
    ),
    line(
      "billing heard from the provider",
      `${report.usageCoverage.attemptsWithProviderReportedUsage} of ${report.usageCoverage.attemptsWithUsage} billed attempts`,
    ),
    "",
    "Failures by class",
    ...(Object.keys(report.failureCounts).length === 0
      ? [line("none", "")]
      : Object.entries(report.failureCounts).map(([failureClass, count]) =>
          line(failureClass, String(count)),
        )),
    "",
  ];

  // The §6 re-check, only when both of its inputs are real measurements.
  if (perShotCost !== null && report.firstPassRate > 0) {
    const shotsPerEpisode = 80;

    lines.push(
      "Gate A economic re-check (consistency-gate.md §6)",
      line("median cost per shot", money(perShotCost.p50)),
      line("measured first-pass rate", `${(report.firstPassRate * 100).toFixed(1)}%`),
      line(
        `projected cost of an ${shotsPerEpisode}-shot episode`,
        money(
          projectEpisodeCostUsd({
            costPerShotUsd: perShotCost.p50,
            firstPassRate: report.firstPassRate,
            shotsPerEpisode,
          }),
        ),
      ),
      "",
      "  Compare against target credit price minus target margin. If it does not",
      "  hold, §6 requires pushing cost down or changing the tier definitions —",
      "  never lowering Gate A.",
      "",
    );
  }

  if (config.provider === "offline") {
    lines.push("Offline dry run: these figures describe the harness, not a provider.", "");
  }

  process.stdout.write(lines.join("\n"));
}

await main();
