import path from "node:path";

import { loadProjectDir, readNodeContent, setProgress } from "@linklike/core";
import { Hono } from "hono";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/project", async (c) => {
    const dir = c.req.query("path");
    if (!dir) {
      return c.json({ error: "path query parameter is required" }, 400);
    }

    const result = await loadProjectDir(path.resolve(dir));
    if (!result.ok) {
      return c.json({ error: "invalid project", issues: result.issues }, 422);
    }

    return c.json(result.data);
  });

  app.get("/project/nodes/:id", async (c) => {
    const dir = c.req.query("path");
    if (!dir) {
      return c.json({ error: "path query parameter is required" }, 400);
    }

    const nodeId = c.req.param("id");
    try {
      const markdown = await readNodeContent(path.resolve(dir), nodeId);
      return c.json({ id: nodeId, markdown });
    } catch (error) {
      return c.json({ error: messageOf(error) }, 404);
    }
  });

  app.patch("/project/progress", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }

    const { path: dir, nodeId, status } = (body ?? {}) as Record<string, unknown>;
    if (
      typeof dir !== "string" ||
      typeof nodeId !== "string" ||
      typeof status !== "string"
    ) {
      return c.json({ error: "path, nodeId, and status are required strings" }, 400);
    }

    try {
      const progress = await setProgress(path.resolve(dir), nodeId, status);
      return c.json({ progress });
    } catch (error) {
      return c.json({ error: messageOf(error) }, 400);
    }
  });

  return app;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
