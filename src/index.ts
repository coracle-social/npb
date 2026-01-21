import { serve } from "@hono/node-server";
import { PORT } from "./env.js";
import { app, injectWebSocket } from "./server.js";
import { migrate, getActiveAlerts } from "./database.js";
import { registerAlert } from "./worker/index.js";

process.on("unhandledRejection", (error: Error) => {
  console.error("Unhandled rejection:", error.stack);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught exception:", error.stack);
  process.exit(1);
});

migrate().then(async () => {
  const server = serve({
    fetch: app.fetch,
    port: Number(PORT),
  });

  injectWebSocket(server);

  console.log("Running on port", PORT);

  for (const alert of await getActiveAlerts()) {
    registerAlert(alert);
  }
});
