import { connect } from "node:net";
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

export type TcpProbe = DependencyProbe & {
  readonly address: { readonly host: string; readonly port: number };
};

const defaultPorts: Readonly<Record<string, number>> = {
  "postgres:": 5432,
  "postgresql:": 5432,
  "redis:": 6379,
  "rediss:": 6380,
  "http:": 80,
  "https:": 443,
};

/**
 * Reachability only: it proves a listener accepted a connection, not that a
 * database will authenticate or a bucket exists. Driver-level probes replace it
 * when `packages/db` and the storage client land; until then this is the honest
 * limit of what the skeleton can assert.
 */
export function tcpProbe(name: string, target: string): TcpProbe {
  const url = new URL(target);
  const fallbackPort = defaultPorts[url.protocol];

  if (url.port === "" && fallbackPort === undefined) {
    throw new Error(`Cannot probe ${name}: no default port for scheme ${url.protocol}`);
  }

  const address = {
    host: url.hostname,
    port: url.port === "" ? (fallbackPort as number) : Number(url.port),
  };

  return {
    name,
    address,
    probe: (signal) =>
      new Promise<void>((resolve, reject) => {
        const socket = connect({ ...address, signal });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
      }),
  };
}
