import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { EnvironmentError, parseApiEnv, parseWebEnv, parseWorkerEnv } from "./env.js";

const databaseUrl = "postgresql://plotpop:local-secret@localhost:5432/plotpop";
const redisUrl = "redis://localhost:6379";

const backendEnv = {
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_BUCKET: "plotpop-local",
  STORAGE_ACCESS_KEY_ID: "plotpop-local",
  STORAGE_SECRET_ACCESS_KEY: "storage-local-secret",
};

describe("api environment", () => {
  it("exposes the parsed dependencies with defaults applied", () => {
    expect(parseApiEnv(backendEnv)).toEqual({
      nodeEnv: "development",
      logLevel: "info",
      port: 3001,
      database: { url: databaseUrl },
      redis: { url: redisUrl },
      storage: {
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        bucket: "plotpop-local",
        accessKeyId: "plotpop-local",
        secretAccessKey: "storage-local-secret",
      },
    });
  });

  it("coerces the port to a number so the http server is not handed a string", () => {
    expect(parseApiEnv({ ...backendEnv, API_PORT: "8080" }).port).toBe(8080);
  });

  it("treats a blank variable as absent instead of parsing it as zero", () => {
    expect(parseApiEnv({ ...backendEnv, API_PORT: "   " }).port).toBe(3001);
  });

  it("rejects a port outside the range a socket can bind", () => {
    expect(() => parseApiEnv({ ...backendEnv, API_PORT: "70000" })).toThrow(EnvironmentError);
    expect(() => parseApiEnv({ ...backendEnv, API_PORT: "not-a-port" })).toThrow(EnvironmentError);
  });

  it("reports every missing variable in one failure rather than only the first", () => {
    const { DATABASE_URL: _url, STORAGE_BUCKET: _bucket, ...incomplete } = backendEnv;

    expect(() => parseApiEnv(incomplete)).toThrow(
      /DATABASE_URL: required[\s\S]*STORAGE_BUCKET: required/,
    );
  });

  it("names the service whose environment failed", () => {
    expect(() => parseApiEnv({})).toThrow(/environment for api/);
  });

  it("rejects a database url that does not address PostgreSQL", () => {
    expect(() =>
      parseApiEnv({ ...backendEnv, DATABASE_URL: "mysql://localhost:3306/plotpop" }),
    ).toThrow(EnvironmentError);
  });

  it("rejects a redis url that does not address Redis", () => {
    expect(() => parseApiEnv({ ...backendEnv, REDIS_URL: "http://localhost:6379" })).toThrow(
      EnvironmentError,
    );
  });

  it("never repeats a credential in the failure it reports", () => {
    const leaked = "super-secret-password";

    try {
      parseApiEnv({
        ...backendEnv,
        DATABASE_URL: `postgres-typo://plotpop:${leaked}@localhost/plotpop`,
      });
      expect.unreachable("expected the malformed database url to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      expect((error as Error).message).toContain("DATABASE_URL");
      expect((error as Error).message).not.toContain(leaked);
    }
  });

  it("rejects an unknown log level instead of silently logging everything", () => {
    expect(() => parseApiEnv({ ...backendEnv, LOG_LEVEL: "verbose" })).toThrow(EnvironmentError);
  });
});

describe("worker environment", () => {
  it("takes its own health port so it can share a host with the api", () => {
    expect(parseWorkerEnv(backendEnv).port).toBe(3002);
    expect(parseWorkerEnv({ ...backendEnv, API_PORT: "8080", WORKER_PORT: "8081" }).port).toBe(
      8081,
    );
  });

  it("requires the queue transport it consumes from", () => {
    const { REDIS_URL: _url, ...withoutRedis } = backendEnv;

    expect(() => parseWorkerEnv(withoutRedis)).toThrow(/REDIS_URL: required/);
  });
});

describe("web environment", () => {
  // ADR-001: the web tier reaches the database, the queue and object storage
  // only through the api. Parsing drops those variables, so even a server
  // component cannot pick a credential out of the web configuration.
  it("carries no infrastructure credentials even when the process has them", () => {
    expect(parseWebEnv({ ...backendEnv, API_BASE_URL: "http://localhost:3001" })).toEqual({
      nodeEnv: "development",
      logLevel: "info",
      apiBaseUrl: "http://localhost:3001",
    });
  });

  it("requires the api origin it calls", () => {
    expect(() => parseWebEnv({})).toThrow(/API_BASE_URL: required/);
  });
});

describe(".env.example", () => {
  // The example file is the only onboarding contract for a fresh environment.
  // Parsing it here means a variable cannot join a schema without being
  // documented, and cannot be documented with a value the schema rejects.
  const example = parseEnv(readFileSync(new URL("../../../.env.example", import.meta.url), "utf8"));

  it("satisfies every service schema", () => {
    expect(() => parseApiEnv(example)).not.toThrow();
    expect(() => parseWorkerEnv(example)).not.toThrow();
    expect(() => parseWebEnv(example)).not.toThrow();
  });
});
