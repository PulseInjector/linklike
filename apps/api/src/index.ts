import { serve } from "@hono/node-server";

import { createApp } from "./app.js";

const port = Number(process.env.LINKLIKE_API_PORT ?? 8787);
const hostname = process.env.LINKLIKE_API_HOST ?? "127.0.0.1";

serve({ fetch: createApp().fetch, port, hostname }, (info) => {
  console.log(`linklike api listening on http://${hostname}:${info.port}`);
});
