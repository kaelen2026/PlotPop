import { serve } from "@hono/node-server";
import { parseApiEnv } from "@plotpop/config";
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

const readiness = createReadinessReporter({
  service: "api",
  logger,
  dependencies: [
    postgresProbe("database", config.database.url),
    redisProbe("redis", config.redis.url),
    httpProbe("storage", config.storage.endpoint),
  ],
});

serve({ fetch: createApp({ readiness }).fetch, port: config.port }, (info) => {
  logger.info("listening", { port: info.port, nodeEnv: config.nodeEnv });
});
