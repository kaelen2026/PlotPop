import { createHealthServer } from "./health-server.js";

// Raw env reads stay here only until F-01.02 introduces the Zod-validated
// config package. Queue consumers arrive with the outbox and queue slice.
const port = Number(process.env.WORKER_HEALTH_PORT ?? 3002);

createHealthServer().listen(port, () => {
  console.log(JSON.stringify({ level: "info", service: "worker", message: "listening", port }));
});
