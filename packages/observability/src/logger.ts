import { type LogLevel, logLevels, type ServiceName } from "@plotpop/contracts";

export type LogFields = Readonly<Record<string, unknown>>;

export type Logger = {
  readonly debug: (message: string, fields?: LogFields) => void;
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
  /** A logger that repeats `fields` on every record, for request or run context. */
  readonly child: (fields: LogFields) => Logger;
};

export type LoggerOptions = {
  readonly service: ServiceName;
  readonly level?: LogLevel;
  /** Defaults to stdout: container runtimes collect it, and one stream keeps records ordered. */
  readonly sink?: (line: string) => void;
  readonly now?: () => Date;
  readonly fields?: LogFields;
};

/**
 * Keys whose values are never safe to print. Named patterns only: a blanket
 * match on `key` would redact `idempotencyKey` and `taskKey`, which are the
 * fields an incident actually needs.
 */
const credentialKey = /pass(word)?|secret|token|credential|authorization|access[-_]?key/i;

/** Reserved by the envelope; a field must not be able to restate them. */
const envelopeKeys = new Set(["time", "level", "service", "message"]);

const maxDepth = 8;

/**
 * Prepares a value for `JSON.stringify`, which would otherwise render an Error
 * as `{}` and throw on a cycle. A log call must never be the thing that fails.
 */
function sanitise(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[function]";
  if (value === null || typeof value !== "object") return value;
  if (depth === 0) return "[truncated]";
  if (seen.has(value)) return "[circular]";

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitise(entry, seen, depth - 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      credentialKey.test(key) ? "[redacted]" : sanitise(entry, seen, depth - 1),
    ]),
  );
}

function sanitiseFields(fields: LogFields): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const entries = Object.entries(fields)
    .filter(([key]) => !envelopeKeys.has(key))
    .map(([key, value]): [string, unknown] => [
      key,
      credentialKey.test(key) ? "[redacted]" : sanitise(value, seen, maxDepth),
    ]);

  return Object.fromEntries(entries);
}

/**
 * A JSON-lines logger: one object per line, no transport, no buffering. Traces
 * and metrics arrive with the OpenTelemetry slice; this exists so the services
 * never grow a `console.log` habit that later has to be undone.
 */
export function createLogger(options: LoggerOptions): Logger {
  const {
    service,
    level = "info",
    sink = (line) => process.stdout.write(line),
    now = () => new Date(),
  } = options;
  const bound = options.fields ?? {};
  const threshold = logLevels.indexOf(level);

  function write(recordLevel: LogLevel, message: string, fields?: LogFields): void {
    if (logLevels.indexOf(recordLevel) < threshold) return;

    const record = {
      time: now().toISOString(),
      level: recordLevel,
      service,
      message,
      ...sanitiseFields({ ...bound, ...fields }),
    };

    sink(`${JSON.stringify(record)}\n`);
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (fields) => createLogger({ ...options, fields: { ...bound, ...fields } }),
  };
}
