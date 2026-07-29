import { connect } from "node:net";
import type { DependencyProbe } from "./readiness.js";

export type ProbeAddress = {
  readonly host: string;
  readonly port: number;
};

export type AddressedProbe = DependencyProbe & {
  readonly address: ProbeAddress;
};

function addressOf(
  name: string,
  target: string,
  defaultPorts: Readonly<Record<string, number>>,
): ProbeAddress {
  const url = new URL(target);
  const fallback = defaultPorts[url.protocol];

  if (fallback === undefined) {
    throw new Error(`Cannot probe ${name}: ${url.protocol} is not a scheme this probe speaks`);
  }

  return { host: url.hostname, port: url.port === "" ? fallback : Number(url.port) };
}

/** Enough of a reply to recognise a protocol; anything longer is not the server we want. */
const maxReplyBytes = 256;

/**
 * Opens a socket, sends `request`, and resolves once `recognises` accepts the
 * reply.
 *
 * Sending something and reading the answer is the point. A socket that merely
 * accepts a connection proves very little: a container runtime will happily
 * accept connections addressed to a container that has stopped, so a probe that
 * stops at `connect` reports a dead dependency as healthy.
 */
function exchange(
  address: ProbeAddress,
  signal: AbortSignal,
  request: Uint8Array,
  recognises: (reply: Buffer) => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const socket = connect({ ...address, signal });
    const chunks: Buffer[] = [];

    const settle = (error?: Error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.once("connect", () => socket.write(request));
    socket.once("error", settle);
    socket.once("end", () =>
      settle(new Error(`${address.host}:${address.port} closed the connection without answering`)),
    );
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const reply = Buffer.concat(chunks);

      if (recognises(reply)) {
        settle();
        return;
      }
      if (reply.length >= maxReplyBytes) {
        settle(new Error(`${address.host}:${address.port} answered with an unrecognised protocol`));
      }
    });
  });
}

const postgresPorts = { "postgres:": 5432, "postgresql:": 5432 };

/**
 * Sends the SSLRequest packet every PostgreSQL client sends first. The server
 * answers `S` or `N` before any authentication, so this proves a PostgreSQL is
 * listening without needing credentials or leaving a session behind.
 *
 * It does not prove the credentials work or the schema is migrated; the pooled
 * driver check replaces it when `packages/db` lands.
 */
export function postgresProbe(name: string, target: string): AddressedProbe {
  const address = addressOf(name, target, postgresPorts);
  const sslRequest = Uint8Array.from([0, 0, 0, 8, 4, 210, 22, 47]);

  return {
    name,
    address,
    // `S` supports TLS, `N` declines it, `E` is an ErrorResponse: all three are
    // PostgreSQL answering.
    probe: (signal) =>
      exchange(address, signal, sslRequest, (reply) =>
        ["S", "N", "E"].includes(String.fromCharCode(reply[0] ?? 0)),
      ),
  };
}

const redisPorts = { "redis:": 6379, "rediss:": 6380 };

/**
 * Sends an inline `PING`. A `+PONG` is the happy answer; a `-NOAUTH` style error
 * also proves Redis is answering, which is what readiness asks about.
 */
export function redisProbe(name: string, target: string): AddressedProbe {
  const address = addressOf(name, target, redisPorts);
  const ping = new TextEncoder().encode("PING\r\n");

  return {
    name,
    address,
    probe: (signal) =>
      exchange(address, signal, ping, (reply) => {
        const text = reply.toString("utf8");
        return text.startsWith("+PONG") || (text.startsWith("-") && text.includes("\r\n"));
      }),
  };
}

const httpPorts = { "http:": 80, "https:": 443 };

/**
 * Any HTTP status counts, including the 403 an S3-compatible endpoint returns for
 * an unauthenticated request to the root: the question is whether the endpoint
 * answers, not whether this request was allowed. Bucket and credential checks
 * belong to the storage client.
 */
export function httpProbe(name: string, target: string): AddressedProbe {
  const address = addressOf(name, target, httpPorts);

  return {
    name,
    address,
    probe: async (signal) => {
      await fetch(target, { method: "GET", signal, redirect: "manual" });
    },
  };
}
