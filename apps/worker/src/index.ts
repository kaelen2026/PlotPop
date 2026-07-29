import { parseWorkerEnv } from "@plotpop/config";
import {
  createLogger,
  createReadinessReporter,
  httpProbe,
  postgresProbe,
  redisProbe,
} from "@plotpop/observability";
import { createHealthServer } from "./health-server.js";

// Parsed before anything binds or connects: a worker missing its queue url
// should fail its own startup rather than dequeue nothing forever.
// Queue consumers arrive with the outbox and queue slice.
const config = parseWorkerEnv();
const logger = createLogger({ service: "worker", level: config.logLevel });

const readiness = createReadinessReporter({
  service: "worker",
  logger,
  dependencies: [
    postgresProbe("database", config.database.url),
    redisProbe("redis", config.redis.url),
    httpProbe("storage", config.storage.endpoint),
  ],
});

createHealthServer({ readiness }).listen(config.port, () => {
  logger.info("listening", { port: config.port, nodeEnv: config.nodeEnv });
});
