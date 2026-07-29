import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseHarnessConfig } from "../config.js";
import { openAttemptLog } from "../records/log.js";
import { evaluateGates } from "../review/gates.js";
import { buildReviewPacket, reviewMappingSchema } from "../review/packet.js";
import {
  parseSequenceScoreCsv,
  parseShotScoreCsv,
  renderSequenceScoreCsv,
  renderShotScoreCsv,
} from "../review/scores.js";
import { midnightNoodleRun } from "../testset/midnight-noodle-run.js";

/**
 * `pnpm research review build` and `pnpm research review score`
 *
 * `build` produces the two things §5's blind procedure needs: a directory of coded
 * clips a rater can be handed, and a scorecard per rater. The un-blinding key goes
 * into a **sibling** directory, `review-key/`, so handing the whole `review/` folder
 * to somebody cannot leak which clip is which redo.
 *
 * `score` reads the filled scorecards back and applies the four gates. It reports
 * `invalid_scorecard` rather than a pass rate when raters disagree too much, because
 * §5 forbids taking the majority vote in that case.
 */

const defaultRaters = ["rater-1", "rater-2", "rater-3"];

function usage(): never {
  process.stderr.write(
    [
      "usage:",
      "  review build [--raters a,b,c]   prepare the blind packet and blank scorecards",
      "  review score                    apply the four gates to the filled scorecards",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

async function build(runDirectory: string, raters: readonly string[]) {
  const records = await (await openAttemptLog(runDirectory)).all();
  const packet = buildReviewPacket(records, {
    // The run id, so rebuilding the packet reproduces the same codes.
    seed: runDirectory,
    shotOrder: midnightNoodleRun.shots.map((shot) => shot.id),
  });

  if (packet.samples.length === 0) {
    throw new Error(`${runDirectory} holds no delivered output to review yet`);
  }

  const reviewDir = join(runDirectory, "review");
  const samplesDir = join(reviewDir, "samples");
  const sequenceDir = join(reviewDir, "sequence");
  const keyDir = join(runDirectory, "review-key");

  await Promise.all([
    mkdir(samplesDir, { recursive: true }),
    mkdir(sequenceDir, { recursive: true }),
    mkdir(keyDir, { recursive: true }),
  ]);

  for (const sample of packet.samples) {
    await copyFile(
      sample.sourcePath,
      join(samplesDir, `${sample.code}${extname(sample.sourcePath)}`),
    );
  }

  // Story order for Gate D, numbered by position. Revealing the order is the point
  // of Gate D; revealing which take it is still is not.
  for (const [index, entry] of packet.sequence.entries()) {
    const name = `${String(index + 1).padStart(2, "0")}${extname(entry.sourcePath)}`;
    await copyFile(entry.sourcePath, join(sequenceDir, name));
  }

  for (const raterId of raters) {
    await writeFile(
      join(reviewDir, `scorecard-${raterId}.csv`),
      renderShotScoreCsv(
        packet.samples.map((sample) => sample.code),
        raterId,
      ),
      "utf8",
    );
  }

  await writeFile(
    join(reviewDir, "sequence-scorecard.csv"),
    renderSequenceScoreCsv(raters),
    "utf8",
  );

  await writeFile(
    join(keyDir, "mapping.json"),
    `${JSON.stringify(packet.mapping, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    [
      "",
      `${packet.samples.length} coded sample(s) in ${samplesDir}`,
      `${packet.sequence.length} shot(s) in story order in ${sequenceDir}`,
      `blank scorecards for ${raters.join(", ")} in ${reviewDir}`,
      `un-blinding key in ${keyDir} — this one does not go to a rater`,
      "",
      "Hand over the review/ directory only. Raters score independently and do not",
      "compare notes before submitting (consistency-gate.md §5).",
      "",
    ].join("\n"),
  );
}

async function score(runDirectory: string) {
  const reviewDir = join(runDirectory, "review");
  const mapping = reviewMappingSchema
    .array()
    .parse(JSON.parse(await readFile(join(runDirectory, "review-key", "mapping.json"), "utf8")));

  const filenames = (await readdir(reviewDir)).filter(
    (name) => name.startsWith("scorecard-") && name.endsWith(".csv"),
  );

  if (filenames.length === 0) {
    throw new Error(`no filled scorecards in ${reviewDir}; run "review build" first`);
  }

  const shotScores = (
    await Promise.all(
      filenames.map(async (name) =>
        parseShotScoreCsv(await readFile(join(reviewDir, name), "utf8")),
      ),
    )
  ).flat();

  const sequenceScores = parseSequenceScoreCsv(
    await readFile(join(reviewDir, "sequence-scorecard.csv"), "utf8"),
  );

  const report = evaluateGates({
    series: midnightNoodleRun,
    mapping,
    shotScores,
    sequenceScores,
  });

  const lines = [
    "",
    `verdict  ${report.verdict.toUpperCase()}`,
    `raters   ${report.raterCount}`,
    `worst pairwise disagreement  ${
      report.worstPairwiseDisagreement === null
        ? "not measured"
        : `${(report.worstPairwiseDisagreement * 100).toFixed(1)}% (§5 ceiling 20%)`
    }`,
    "",
  ];

  if (report.verdict === "invalid_scorecard") {
    lines.push(
      "§5: the scorecard's wording does not read the same to three people, or fewer",
      "than three scored it. Revise the definitions and re-score. Do not take the",
      "majority vote.",
      "",
    );
  } else {
    for (const gate of report.gates) {
      lines.push(`Gate ${gate.gate}  ${gate.passed ? "pass" : "FAIL"}  ${gate.detail}`);
    }
    lines.push("");

    if (report.verdict === "failed") {
      lines.push(
        "consistency-gate.md §7 has the remedy per failed gate. None of them is",
        "lowering the gate.",
        "",
      );
    }
  }

  process.stdout.write(lines.join("\n"));
  if (report.verdict !== "passed") process.exitCode = 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const config = parseHarnessConfig(process.env);
  const runDirectory = join(config.runDir, config.runId);

  if (command === "build") {
    const flagIndex = rest.indexOf("--raters");
    const raters =
      flagIndex === -1 ? defaultRaters : (rest[flagIndex + 1] ?? "").split(",").filter(Boolean);

    if (raters.length === 0) usage();

    await build(runDirectory, raters);
    return;
  }

  if (command === "score") {
    await score(runDirectory);
    return;
  }

  usage();
}

await main();
