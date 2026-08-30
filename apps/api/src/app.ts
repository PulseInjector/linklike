import path from "node:path";

import {
  isLinklikeError,
  linklikeErrorMessage,
  loadProjectDir,
  readNodeContent,
  runCore,
  setProgress,
  type LinklikeError,
} from "@linklike/core";
import { Hono } from "hono";

function coreResponse(error: LinklikeError): {
  status: 400 | 404 | 422 | 500;
  body: { tag: string; error: string };
} {
  const message = linklikeErrorMessage(error);
  switch (error._tag) {
    case "InvalidProject":
      return { status: 422, body: { tag: error._tag, error: message } };
    case "InvalidNodeId":
    case "UnknownNode":
      return { status: 404, body: { tag: error._tag, error: message } };
    case "InvalidStatus":
    case "EmptyTitle":
    case "UnknownParent":
    case "GraphIntegrityError":
      return { status: 400, body: { tag: error._tag, error: message } };
    case "LockTimeout":
    case "IoError":
      return { status: 500, body: { tag: error._tag, error: message } };
  }
}

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/project", async (c) => {
    const dir = c.req.query("path");
    if (!dir) {
      return c.json({ error: "path query parameter is required" }, 400);
    }

    try {
      const data = await runCore(loadProjectDir(path.resolve(dir)));
      return c.json(data);
    } catch (error) {
      if (isLinklikeError(error) && error._tag === "InvalidProject") {
        return c.json(
          {
            tag: error._tag,
            error: linklikeErrorMessage(error),
            issues: error.issues,
          },
          422,
        );
      }
      if (isLinklikeError(error)) {
        const { status, body } = coreResponse(error);
        return c.json(body, status);
      }
      return c.json({ tag: "UnknownError", error: String(error) }, 500);
    }
  });

  app.get("/project/nodes/:id", async (c) => {
    const dir = c.req.query("path");
    if (!dir) {
      return c.json({ error: "path query parameter is required" }, 400);
    }

    const nodeId = c.req.param("id");
    try {
      const markdown = await runCore(readNodeContent(path.resolve(dir), nodeId));
      return c.json({ id: nodeId, markdown });
    } catch (error) {
      if (isLinklikeError(error)) {
        const { status, body } = coreResponse(error);
        return c.json(body, status);
      }
      return c.json({ tag: "UnknownError", error: String(error) }, 500);
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
      const progress = await runCore(setProgress(path.resolve(dir), nodeId, status));
      return c.json({ progress });
    } catch (error) {
      if (isLinklikeError(error)) {
        const { status: httpStatus, body: responseBody } = coreResponse(error);
        return c.json(responseBody, httpStatus);
      }
      return c.json({ tag: "UnknownError", error: String(error) }, 500);
    }
  });

  return app;
}
