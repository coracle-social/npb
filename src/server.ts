import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import type { Context } from "hono";
import { appSigner } from "./env.js";
import { Connection } from "./relay.js";

export const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/", async (c: Context) => {
  if (c.req.header("Accept") !== "application/nostr+json") {
    return c.json({ error: "Not found" }, 404);
  } else {
    return c.json(
      {
        name: "Nostr Push Bridge",
        icon: "https://pfp.nostr.build/2644089e06a950889fa4aa81f6152a51fba23497735cbba351aa6972460df6f5.jpg",
        description: "A relay which accepts kind 30390 push notification subscriptions on behalf of public relays.",
        pubkey: await appSigner.getPubkey(),
        software: "https://github.com/coracle-social/npb",
      },
      200,
      { "Content-Type": "application/nostr+json; charset=utf-8" },
    );
  }
});

let connectionsCount = 0;

app.get(
  "/",
  upgradeWebSocket((c) => {
    return {
      onOpen(_event, ws) {
        const socket = ws.raw;
        if (!socket) {
          console.error("WebSocket raw socket is undefined");
          return;
        }

        const hostname = c.req.header("host") || "";
        const connection = new Connection(socket, hostname);

        console.log(
          `Opening websocket connection; ${++connectionsCount} total`,
        );

        socket.on("message", (msg) => connection.handle(msg));

        socket.on("error", () => {
          console.log(
            `Error on websocket connection; ${--connectionsCount} total`,
          );
          connection.cleanup();
        });

        socket.on("close", () => {
          console.log(
            `Closing websocket connection; ${--connectionsCount} total`,
          );
          connection.cleanup();
        });
      },
    };
  }),
);

export { injectWebSocket };
