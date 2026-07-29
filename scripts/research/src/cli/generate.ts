import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseHarnessConfig } from "../config.js";
import { probeMediaFile } from "../media/ffprobe.js";
import { createOfflineProvider } from "../providers/offline.js";
import { createReplicateProvider } from "../providers/replicate.js";
import { openAttemptLog } from "../records/log.js";
import { type MediaProbe, runExperiment } from "../runner/run.js";
import { midnightNoodleRun } from "../testset/midnight-noodle-run.js";

/**
 * `pnpm --filter @plotpop/research-harness generate`
 *
 * Runs with the offline provider and no credentials by default, so the first thing
 * anybody does costs nothing. Pointing it at a real provider takes the four
 * variables `config.ts` insists on.
 *
 * `--only <shot-id>` exists to be used before a full run. One shot proves the
 * adapter's field mapping for the price of one shot; discovering a wrong field name
 * on shot 30 costs thirty.
 */

function parseArguments(argv: readonly string[]) {
  const only: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === "--only") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--only needs a shot id, e.g. --only shot-01");
      only.push(...value.split(","));
      index += 1;
      continue;
    }

    throw new Error(`unknown argument ${flag}. Supported: --only <shot-id[,shot-id]>`);
  }

  return { only };
}

async function main() {
  const { only } = parseArguments(process.argv.slice(2));
  const config = parseHarnessConfig(process.env);
  const runDirectory = join(config.runDir, config.runId);

  await mkdir(runDirectory, { recursive: true });

  // The manifest is what makes a run's figures interpretable six weeks later:
  // which provider, which model, which unit price, which tier, which test set.
  await writeFile(
    join(runDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        runId: config.runId,
        startedAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        tier: config.tier,
        billableUnit: config.billableUnit,
        unitPriceUsd: config.unitPriceUsd,
        spendCapUsd: config.spendCapUsd,
        maxAttemptsPerShot: config.maxAttemptsPerShot,
        testSet: { id: midnightNoodleRun.id, frozenOn: midnightNoodleRun.frozenOn },
        shotIds: only.length > 0 ? only : midnightNoodleRun.shots.map((shot) => shot.id),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const offline = config.provider === "offline" ? createOfflineProvider(config.tier) : null;

  const provider =
    offline ??
    createReplicateProvider({
      baseUrl: config.baseUrl,
      // Non-null by construction: `parseHarnessConfig` refuses a real provider
      // without them.
      apiToken: config.apiToken ?? "",
      model: config.model ?? "",
      extraInput: JSON.parse(process.env.PLOTPOP_RESEARCH_MODEL_INPUT ?? "{}") as Record<
        string,
        unknown
      >,
    });

  // A dry run needs no ffmpeg: the offline provider states the facts a probe would
  // have read. Nothing else is allowed to state its own measurements.
  const probe: MediaProbe = offline
    ? // .../shots/<shot-id>/attempt-N.mp4
      async (filePath) => offline.factsFor(filePath.split("/").at(-2) ?? "")
    : probeMediaFile;

  const outcome = await runExperiment(
    config,
    midnightNoodleRun,
    {
      provider,
      probe,
      log: await openAttemptLog(runDirectory),
      report: (message) => process.stdout.write(`${message}\n`),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => new Date(),
      random: Math.random,
    },
    only.length > 0 ? { onlyShotIds: only } : {},
  );

  process.stdout.write(
    [
      "",
      `run       ${config.runId}`,
      `provider  ${config.provider}${config.model === null ? "" : ` (${config.model})`}`,
      `generated ${outcome.generated} attempt(s), skipped ${outcome.skipped} shot(s)`,
      `spent     ${outcome.settledUsd.toFixed(4)} USD${outcome.stoppedEarly ? " — stopped at the cap" : ""}`,
      `log       ${join(runDirectory, "attempts.jsonl")}`,
      "",
      "Next: pnpm --filter @plotpop/research-harness report",
      "",
    ].join("\n"),
  );

  if (config.provider === "offline") {
    process.stdout.write(
      "This was an offline dry run. Its outputs are not video and its costs are\nzero: nothing from it belongs in docs/research/unit-economics.md.\n\n",
    );
  }
}

await main();
