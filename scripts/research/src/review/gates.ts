import { shotsOfScene, type TestSeries } from "../testset/schema.js";
import type { ReviewMapping } from "./packet.js";
import type { SequenceScore, ShotScore } from "./scores.js";

/**
 * The four gates of `docs/research/consistency-gate.md`, as a computation.
 *
 * This file implements the frozen definitions; it does not hold them. §2 forbids
 * lowering a threshold after a run, and the point of computing them here is that
 * "we got 22, let us call 22 fine" has to be a visible edit to a tested function
 * rather than a paragraph nobody rereads.
 *
 * The calibration rule from §5 comes first and is not a gate. Past 20% pairwise
 * disagreement, "publishable" does not mean the same thing to three people, and §5
 * is explicit that the majority vote must **not** be taken anyway — so a badly
 * calibrated scorecard produces no gate outcomes at all, not four failing ones.
 */

export type GateOutcome = {
  readonly gate: "A" | "B" | "C" | "D";
  readonly passed: boolean;
  readonly detail: string;
};

export type GateReport = {
  readonly verdict: "passed" | "failed" | "invalid_scorecard";
  readonly raterCount: number;
  readonly worstPairwiseDisagreement: number | null;
  readonly gates: readonly GateOutcome[];
  readonly firstPassShotIds: readonly string[];
  readonly unresolvedShotIds: readonly string[];
};

export type GateInput = {
  readonly series: TestSeries;
  readonly mapping: readonly ReviewMapping[];
  readonly shotScores: readonly ShotScore[];
  readonly sequenceScores: readonly SequenceScore[];
};

/** §3.1 and §4: at least two thirds of raters answering yes. */
const majority = 2 / 3;
/** §5: past this, the scorecard's own wording is the problem. */
const disagreementCeiling = 0.2;
/** §5: three target creators, none of them on the team. */
const requiredRaters = 3;
/** §4 Gate A: 75% of the frozen set. */
const firstPassShare = 0.75;
/** §4 Gate C: three in a row is clustering, two is chance. */
const maxConsecutiveFailures = 3;

function agrees(votes: readonly boolean[]): boolean {
  if (votes.length === 0) return false;

  return votes.filter(Boolean).length / votes.length >= majority;
}

export function evaluateGates(input: GateInput): GateReport {
  const codes = new Set(input.mapping.map((entry) => entry.code));
  const raterIds = [...new Set(input.shotScores.map((score) => score.raterId))].sort();

  const votes = new Map<string, Map<string, boolean>>();

  for (const score of input.shotScores) {
    if (!codes.has(score.code)) {
      throw new Error(`the scorecard holds ${score.code}, which this packet never issued`);
    }

    const perCode = votes.get(score.code) ?? new Map<string, boolean>();

    if (perCode.has(score.raterId)) {
      throw new Error(`${score.raterId} scored ${score.code} twice`);
    }

    perCode.set(score.raterId, score.publishable);
    votes.set(score.code, perCode);
  }

  // A sample only some raters scored would silently change the majority
  // threshold under it, so it is refused rather than averaged over.
  for (const [code, perCode] of votes) {
    const missing = raterIds.filter((raterId) => !perCode.has(raterId));

    if (missing.length > 0) {
      throw new Error(`${code} was not scored by ${missing.join(", ")}`);
    }
  }

  const worstPairwiseDisagreement = worstDisagreement(raterIds, votes);

  if (raterIds.length < requiredRaters || (worstPairwiseDisagreement ?? 0) > disagreementCeiling) {
    return {
      verdict: "invalid_scorecard",
      raterCount: raterIds.length,
      worstPairwiseDisagreement,
      gates: [],
      firstPassShotIds: [],
      unresolvedShotIds: [],
    };
  }

  const passed = new Set(
    [...votes.entries()]
      .filter(([, perCode]) => agrees([...perCode.values()]))
      .map(([code]) => code),
  );

  const shotIds = input.series.shots.map((shot) => shot.id);
  const byShot = new Map<string, ReviewMapping[]>();

  for (const entry of input.mapping) {
    const existing = byShot.get(entry.shotId);
    if (existing) existing.push(entry);
    else byShot.set(entry.shotId, [entry]);
  }

  const firstAttemptPassed = (shotId: string) =>
    (byShot.get(shotId) ?? []).some((entry) => entry.attemptNumber === 1 && passed.has(entry.code));

  const firstPassShotIds = shotIds.filter(firstAttemptPassed);
  const unresolvedShotIds = shotIds.filter(
    (shotId) => !(byShot.get(shotId) ?? []).some((entry) => passed.has(entry.code)),
  );

  const gateAThreshold = Math.ceil(firstPassShare * shotIds.length);
  const clustering = describeClustering(input.series, firstAttemptPassed);
  const sequenceVotes = input.sequenceScores.map((score) => score.willingToPublish);

  const gates: GateOutcome[] = [
    {
      gate: "A",
      passed: firstPassShotIds.length >= gateAThreshold,
      detail: `${firstPassShotIds.length} of ${shotIds.length} shots passed first time; the gate needs ${gateAThreshold}`,
    },
    {
      gate: "B",
      passed: unresolvedShotIds.length === 0,
      detail:
        unresolvedShotIds.length === 0
          ? "every shot reached a publishable version inside the attempt budget"
          : `no publishable version for ${unresolvedShotIds.join(", ")}`,
    },
    {
      gate: "C",
      passed: clustering.length === 0,
      detail:
        clustering.length === 0 ? "first-try failures did not cluster" : clustering.join("; "),
    },
    {
      gate: "D",
      passed: agrees(sequenceVotes),
      detail: `${sequenceVotes.filter(Boolean).length} of ${sequenceVotes.length} raters would publish the sequence`,
    },
  ];

  return {
    verdict: gates.every((outcome) => outcome.passed) ? "passed" : "failed",
    raterCount: raterIds.length,
    worstPairwiseDisagreement,
    gates,
    firstPassShotIds,
    unresolvedShotIds,
  };
}

/**
 * The highest disagreement rate between any two raters.
 *
 * The worst pair, not the average: §5 is about whether the scorecard's wording
 * reads the same to everyone, and an average hides one rater reading it differently
 * from the other two.
 */
function worstDisagreement(
  raterIds: readonly string[],
  votes: ReadonlyMap<string, ReadonlyMap<string, boolean>>,
): number | null {
  let worst: number | null = null;

  for (let left = 0; left < raterIds.length; left += 1) {
    for (let right = left + 1; right < raterIds.length; right += 1) {
      const leftId = raterIds[left];
      const rightId = raterIds[right];
      if (leftId === undefined || rightId === undefined) continue;

      let compared = 0;
      let differed = 0;

      for (const perCode of votes.values()) {
        const leftVote = perCode.get(leftId);
        const rightVote = perCode.get(rightId);
        if (leftVote === undefined || rightVote === undefined) continue;

        compared += 1;
        if (leftVote !== rightVote) differed += 1;
      }

      if (compared === 0) continue;
      const rate = differed / compared;
      worst = worst === null ? rate : Math.max(worst, rate);
    }
  }

  return worst;
}

/**
 * Gate C's two clustering rules.
 *
 * Consecutive is read off shot rank, not off the order the log or the packet
 * happens to hold: "three in a row" is a statement about the finished sequence,
 * which is what would interrupt an exchange (§32.3).
 */
function describeClustering(
  series: TestSeries,
  firstAttemptPassed: (shotId: string) => boolean,
): string[] {
  const problems: string[] = [];
  const ordered = [...series.shots].sort((left, right) => left.rank - right.rank);

  let run: string[] = [];
  for (const shot of ordered) {
    if (firstAttemptPassed(shot.id)) {
      run = [];
      continue;
    }

    run.push(shot.id);

    if (run.length >= maxConsecutiveFailures) {
      problems.push(`${run.length} consecutive first-try failures at ${run.join(", ")}`);
      break;
    }
  }

  for (const scene of series.scenes) {
    const shots = shotsOfScene(series, scene.id);
    const failed = shots.filter((shot) => !firstAttemptPassed(shot.id));

    if (failed.length > shots.length / 2) {
      problems.push(
        `${failed.length} of ${shots.length} shots in ${scene.id} failed first try, more than half`,
      );
    }
  }

  return problems;
}
