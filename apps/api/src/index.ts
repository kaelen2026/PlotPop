import { serve } from "@hono/node-server";
import { parseApiEnv } from "@plotpop/config";
import { app } from "./app.js";

// Parsed before the server binds: a container missing a credential should fail
// its own startup, not its first request.
const config = parseApiEnv();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    JSON.stringify({ level: "info", service: "api", message: "listening", port: info.port }),
  );
});
