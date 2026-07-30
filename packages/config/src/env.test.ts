import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { EnvironmentError, parseApiEnv, parseWebEnv, parseWorkerEnv } from "./env.js";

const databaseUrl = "postgresql://plotpop:local-secret@localhost:5432/plotpop";
const redisUrl = "redis://localhost:6379";

const authSecret = "auth-local-secret-with-enough-entropy";

const backendEnv = {
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  STORAGE_ENDPOINT: "http://minio:9000",
  STORAGE_PUBLIC_ENDPOINT: "http://localhost:9000",
  STORAGE_BUCKET: "plotpop-local",
  STORAGE_ACCESS_KEY_ID: "plotpop-local",
  STORAGE_SECRET_ACCESS_KEY: "storage-local-secret",
};

/** The api additionally holds the Better Auth configuration (ADR-007). */
const apiEnv = {
  ...backendEnv,
  BETTER_AUTH_SECRET: authSecret,
  AUTH_BASE_URL: "http://localhost:3000",
  AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
};

describe("api environment", () => {
  it("exposes the parsed dependencies with defaults applied", () => {
    expect(parseApiEnv(apiEnv)).toEqual({
      nodeEnv: "development",
      logLevel: "info",
      port: 3001,
      database: { url: databaseUrl },
      redis: { url: redisUrl },
      storage: {
        endpoint: "http://minio:9000",
        publicEndpoint: "http://localhost:9000",
        region: "us-east-1",
        bucket: "plotpop-local",
        accessKeyId: "plotpop-local",
        secretAccessKey: "storage-local-secret",
      },
      auth: {
        secret: authSecret,
        baseUrl: "http://localhost:3000",
        trustedOrigins: ["http://localhost:3000"],
      },
    });
  });

  it("splits the trusted origin allowlist and keeps only the origin of each entry", () => {
    const { auth } = parseApiEnv({
      ...apiEnv,
      AUTH_TRUSTED_ORIGINS: "https://plotpop.com, https://www.plotpop.com/ignored-path",
    });

    expect(auth.trustedOrigins).toEqual(["https://plotpop.com", "https://www.plotpop.com"]);
  });

  it("rejects a signing secret short enough to be worth guessing", () => {
    expect(() => parseApiEnv({ ...apiEnv, BETTER_AUTH_SECRET: "too-short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("requires at least one trusted origin rather than falling back to allowing any", () => {
    expect(() => parseApiEnv({ ...apiEnv, AUTH_TRUSTED_ORIGINS: "," })).toThrow(
      /AUTH_TRUSTED_ORIGINS/,
    );
  });

  // ADR-007: a production allowlist containing localhost lets anything running on
  // a visitor's own machine drive the authenticated api.
  it("refuses a loopback trusted origin in production", () => {
    expect(() =>
      parseApiEnv({
        ...apiEnv,
        NODE_ENV: "production",
        AUTH_TRUSTED_ORIGINS: "https://plotpop.com,http://127.0.0.1:3000",
      }),
    ).toThrow(/AUTH_TRUSTED_ORIGINS/);
  });

  it("allows a loopback trusted origin outside production, which is how local development works", () => {
    expect(parseApiEnv({ ...apiEnv, NODE_ENV: "development" }).auth.trustedOrigins).toEqual([
      "http://localhost:3000",
    ]);
  });

  it("never repeats the signing secret in the failure it reports", () => {
    try {
      parseApiEnv({ ...apiEnv, AUTH_BASE_URL: "not-a-url" });
      expect.unreachable("expected the malformed auth base url to be rejected");
    } catch (error) {
      expect((error as Error).message).toContain("AUTH_BASE_URL");
      expect((error as Error).message).not.toContain(authSecret);
    }
  });

  /*
   * §26: the browser uploads straight to object storage through a signed url, and the
   * host is part of what gets signed. The api reaches storage on an internal address
   * that a browser cannot resolve, so the address it signs for is a separate variable.
   */
  it("requires the browser facing storage origin rather than falling back to its own", () => {
    const { STORAGE_PUBLIC_ENDPOINT: _public, ...withoutPublicEndpoint } = apiEnv;

    // Defaulting to STORAGE_ENDPOINT would sign urls for an unreachable internal host,
    // which fails at the first upload instead of at startup — and in production it
    // would leak the internal address into a browser.
    expect(() => parseApiEnv(withoutPublicEndpoint)).toThrow(/STORAGE_PUBLIC_ENDPOINT/);
  });

  it("coerces the port to a number so the http server is not handed a string", () => {
    expect(parseApiEnv({ ...apiEnv, API_PORT: "8080" }).port).toBe(8080);
  });

  it("treats a blank variable as absent instead of parsing it as zero", () => {
    expect(parseApiEnv({ ...apiEnv, API_PORT: "   " }).port).toBe(3001);
  });

  it("rejects a port outside the range a socket can bind", () => {
    expect(() => parseApiEnv({ ...apiEnv, API_PORT: "70000" })).toThrow(EnvironmentError);
    expect(() => parseApiEnv({ ...apiEnv, API_PORT: "not-a-port" })).toThrow(EnvironmentError);
  });

  it("reports every missing variable in one failure rather than only the first", () => {
    const { DATABASE_URL: _url, STORAGE_BUCKET: _bucket, ...incomplete } = apiEnv;

    expect(() => parseApiEnv(incomplete)).toThrow(
      /DATABASE_URL: required[\s\S]*STORAGE_BUCKET: required/,
    );
  });

  it("names the service whose environment failed", () => {
    expect(() => parseApiEnv({})).toThrow(/environment for api/);
  });

  it("rejects a database url that does not address PostgreSQL", () => {
    expect(() =>
      parseApiEnv({ ...apiEnv, DATABASE_URL: "mysql://localhost:3306/plotpop" }),
    ).toThrow(EnvironmentError);
  });

  it("rejects a redis url that does not address Redis", () => {
    expect(() => parseApiEnv({ ...apiEnv, REDIS_URL: "http://localhost:6379" })).toThrow(
      EnvironmentError,
    );
  });

  it("never repeats a credential in the failure it reports", () => {
    const leaked = "super-secret-password";

    try {
      parseApiEnv({
        ...apiEnv,
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
    expect(() => parseApiEnv({ ...apiEnv, LOG_LEVEL: "verbose" })).toThrow(EnvironmentError);
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

  // ADR-007: the worker acts under an internal service identity and never
  // receives or forwards a user session, so it has no reason to be able to sign
  // one. Parsing drops the secret even when the process was handed it.
  it("carries no session signing secret", () => {
    expect(parseWorkerEnv(apiEnv)).not.toHaveProperty("auth");
  });

  // The worker never hands a url to a browser: it reaches storage on the internal
  // address and signs nothing for anyone else. Parsing drops the public origin for the
  // same reason it drops the auth secret — the configuration should not suggest a
  // capability the service has no business having.
  it("carries no browser facing storage origin", () => {
    expect(parseWorkerEnv(apiEnv).storage).not.toHaveProperty("publicEndpoint");
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
