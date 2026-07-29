import { parseWorkerEnv } from "@plotpop/config";
import { createLogger } from "@plotpop/observability";
import { createHealthServer } from "./health-server.js";

// Parsed before anything binds or connects: a worker missing its queue url
// should fail its own startup rather than dequeue nothing forever.
// Queue consumers arrive with the outbox and queue slice.
const config = parseWorkerEnv();
const logger = createLogger({ service: "worker", level: config.logLevel });

createHealthServer().listen(config.port, () => {
  logger.info("listening", { port: config.port, nodeEnv: config.nodeEnv });
});
