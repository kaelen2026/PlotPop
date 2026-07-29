import { serve } from "@hono/node-server";
import { parseApiEnv } from "@plotpop/config";
import { createLogger } from "@plotpop/observability";
import { app } from "./app.js";

// Parsed before the server binds: a container missing a credential should fail
// its own startup, not its first request.
const config = parseApiEnv();
const logger = createLogger({ service: "api", level: config.logLevel });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info("listening", { port: info.port, nodeEnv: config.nodeEnv });
});
