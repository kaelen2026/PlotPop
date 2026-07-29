import { createServer as createHttpServer } from "node:http";
import { type AddressInfo, createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { httpProbe, postgresProbe, redisProbe } from "./probes.js";
import { createReadinessReporter } from "./readiness.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

/** A socket that accepts connections and then behaves however the test says. */
async function listen(onConnect: (write: (reply: string) => void) => void): Promise<number> {
  const server = createServer((socket) => {
    socket.on("data", () => onConnect((reply) => socket.write(reply)));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return (server.address() as AddressInfo).port;
}

async function reachable(dependency: { name: string; probe: (s: AbortSignal) => Promise<void> }) {
  const report = await createReadinessReporter({
    service: "api",
    dependencies: [dependency],
    timeoutMs: 250,
  })();

  return report.status === "ready";
}

describe("postgres probe", () => {
  it("accepts a server that answers the ssl negotiation byte", async () => {
    const port = await listen((write) => write("S"));

    expect(await reachable(postgresProbe("database", `postgresql://p@127.0.0.1:${port}/p`))).toBe(
      true,
    );
  });

  it("accepts a server that reports an error, which still proves postgres answered", async () => {
    const port = await listen((write) => write("E"));

    expect(await reachable(postgresProbe("database", `postgresql://p@127.0.0.1:${port}/p`))).toBe(
      true,
    );
  });

  // The local container runtime accepts connections to a stopped container and
  // never speaks. A reachability check that only opens a socket reports such a
  // dependency as healthy, which is worse than reporting nothing.
  it("rejects a socket that accepts the connection but never speaks postgres", async () => {
    const port = await listen(() => {});

    expect(await reachable(postgresProbe("database", `postgresql://p@127.0.0.1:${port}/p`))).toBe(
      false,
    );
  });

  it("rejects a server speaking something else entirely", async () => {
    const port = await listen((write) => write("HTTP/1.1 200 OK\r\n\r\n"));

    expect(await reachable(postgresProbe("database", `postgresql://p@127.0.0.1:${port}/p`))).toBe(
      false,
    );
  });

  it("rejects a closed port", async () => {
    expect(await reachable(postgresProbe("database", "postgresql://p@127.0.0.1:1/p"))).toBe(false);
  });
});

describe("redis probe", () => {
  it("accepts a server that answers PING", async () => {
    const port = await listen((write) => write("+PONG\r\n"));

    expect(await reachable(redisProbe("redis", `redis://127.0.0.1:${port}`))).toBe(true);
  });

  it("accepts an authentication complaint, which still proves redis answered", async () => {
    const port = await listen((write) => write("-NOAUTH Authentication required.\r\n"));

    expect(await reachable(redisProbe("redis", `redis://127.0.0.1:${port}`))).toBe(true);
  });

  it("rejects a socket that accepts the connection but never speaks redis", async () => {
    const port = await listen(() => {});

    expect(await reachable(redisProbe("redis", `redis://127.0.0.1:${port}`))).toBe(false);
  });

  it("rejects a server speaking something else entirely", async () => {
    const port = await listen((write) => write("220 smtp ready\r\n"));

    expect(await reachable(redisProbe("redis", `redis://127.0.0.1:${port}`))).toBe(false);
  });
});

describe("http probe", () => {
  it("accepts any http answer, including a refusal to serve the root", async () => {
    const server = createHttpServer((_request, response) => {
      response.writeHead(403).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    expect(await reachable(httpProbe("storage", `http://127.0.0.1:${port}`))).toBe(true);
  });

  it("rejects a socket that never answers http", async () => {
    const port = await listen(() => {});

    expect(await reachable(httpProbe("storage", `http://127.0.0.1:${port}`))).toBe(false);
  });

  it("rejects a closed port", async () => {
    expect(await reachable(httpProbe("storage", "http://127.0.0.1:1"))).toBe(false);
  });
});

describe("probe targets", () => {
  it("derives the port from the scheme when the url omits it", () => {
    expect(postgresProbe("database", "postgresql://plotpop@db/plotpop").address).toEqual({
      host: "db",
      port: 5432,
    });
    expect(redisProbe("redis", "redis://cache").address).toEqual({ host: "cache", port: 6379 });
    expect(httpProbe("storage", "https://storage.example.com").address).toEqual({
      host: "storage.example.com",
      port: 443,
    });
  });

  it("keeps an explicit port", () => {
    expect(redisProbe("redis", "redis://cache:6380").address).toEqual({
      host: "cache",
      port: 6380,
    });
  });

  it("refuses a target whose scheme it cannot speak", () => {
    expect(() => postgresProbe("database", "mysql://db/plotpop")).toThrow(/mysql:/);
    expect(() => redisProbe("redis", "http://cache")).toThrow(/http:/);
    expect(() => httpProbe("storage", "ftp://files")).toThrow(/ftp:/);
  });
});
