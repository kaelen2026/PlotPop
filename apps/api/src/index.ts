import { serve } from "@hono/node-server";
import { app } from "./app.js";

// Raw env reads stay here only until F-01.02 introduces the Zod-validated
// config package.
const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    JSON.stringify({ level: "info", service: "api", message: "listening", port: info.port }),
  );
});
