import { serve } from "@hono/node-server";

import { createApp } from "./app.js";

const port = Number(process.env.LINKLIKE_API_PORT ?? 8787);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`linklike api listening on http://localhost:${info.port}`);
});
