import { serve } from "@hono/node-server";
import { createAuthService } from "@plotpop/auth";
import { parseApiEnv } from "@plotpop/config";
import { createDatabase } from "@plotpop/db";
import {
  createLogger,
  createReadinessReporter,
  httpProbe,
  postgresProbe,
  redisProbe,
} from "@plotpop/observability";
import { createApp } from "./app.js";

// Parsed before the server binds: a container missing a credential should fail
// its own startup, not its first request.
const config = parseApiEnv();
const logger = createLogger({ service: "api", level: config.logLevel });

const db = createDatabase({ url: config.database.url });

const auth = createAuthService({
  db,
  secret: config.auth.secret,
  baseUrl: config.auth.baseUrl,
  trustedOrigins: config.auth.trustedOrigins,
  // Over plain http a Secure cookie is dropped by the browser, which would look
  // like a broken login rather than a missing certificate during development.
  useSecureCookies: config.nodeEnv === "production",
});

const readiness = createReadinessReporter({
  service: "api",
  logger,
  dependencies: [
    postgresProbe("database", config.database.url),
    redisProbe("redis", config.redis.url),
    httpProbe("storage", config.storage.endpoint),
  ],
});

serve({ fetch: createApp({ readiness, auth }).fetch, port: config.port }, (info) => {
  logger.info("listening", { port: info.port, nodeEnv: config.nodeEnv });
});
