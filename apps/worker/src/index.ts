import { parseWorkerEnv } from "@plotpop/config";
import { createHealthServer } from "./health-server.js";

// Parsed before anything binds or connects: a worker missing its queue url
// should fail its own startup rather than dequeue nothing forever.
// Queue consumers arrive with the outbox and queue slice.
const config = parseWorkerEnv();

createHealthServer().listen(config.port, () => {
  console.log(
    JSON.stringify({ level: "info", service: "worker", message: "listening", port: config.port }),
  );
});
