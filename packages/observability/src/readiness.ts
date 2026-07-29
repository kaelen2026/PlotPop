import type { DependencyReport, ReadinessResponse, ServiceName } from "@plotpop/contracts";
import type { Logger } from "./logger.js";

export type DependencyProbe = {
  readonly name: string;
  /** Resolves when the dependency answered; rejects or ignores `signal` otherwise. */
  readonly probe: (signal: AbortSignal) => Promise<void>;
};

export type ReadinessReporter = () => Promise<ReadinessResponse>;

export type ReadinessOptions = {
  readonly service: ServiceName;
  readonly dependencies: readonly DependencyProbe[];
  /** A probe that has not answered by now is treated as unavailable. */
  readonly timeoutMs?: number;
  readonly logger?: Logger;
};

const defaultTimeoutMs = 2_000;

/** Rejects when the signal aborts, so a probe that ignores it still gets bounded. */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function settle(
  dependency: DependencyProbe,
  timeoutMs: number,
  logger: Logger | undefined,
): Promise<DependencyReport> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`no answer within ${timeoutMs}ms`)),
    timeoutMs,
  );

  try {
    await Promise.race([dependency.probe(controller.signal), whenAborted(controller.signal)]);
    return { name: dependency.name, status: "up" };
  } catch (error) {
    logger?.warn("dependency unavailable", { dependency: dependency.name, error });
    return { name: dependency.name, status: "down" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes every dependency concurrently and always answers: one unreachable
 * dependency must not hide the state of the others, which is the only thing that
 * makes the report useful while an incident is still being diagnosed.
 */
export function createReadinessReporter(options: ReadinessOptions): ReadinessReporter {
  const { service, dependencies, timeoutMs = defaultTimeoutMs, logger } = options;

  return async () => {
    const reports = await Promise.all(
      dependencies.map((dependency) => settle(dependency, timeoutMs, logger)),
    );

    return {
      status: reports.every((report) => report.status === "up") ? "ready" : "degraded",
      service,
      dependencies: reports,
    };
  };
}
