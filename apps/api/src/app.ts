import path from "node:path";

import {
  addNode,
  deleteNode,
  initProjectDir,
  isLinklikeError,
  linklikeErrorMessage,
  loadProjectDir,
  readNodeContent,
  runCore,
  setProgress,
  writeNodeContent,
  type LinklikeError,
} from "@linklike/core";
import { Hono } from "hono";

import { pickFolderNative, type PickFolderResult } from "./pick-folder.js";

function coreResponse(error: LinklikeError): {
  status: 400 | 404 | 409 | 422 | 500;
  body: { tag: string; error: string };
} {
  const message = linklikeErrorMessage(error);
  switch (error._tag) {
    case "InvalidProject":
      return { status: 422, body: { tag: error._tag, error: message } };
    case "InvalidNodeId":
    case "UnknownNode":
    case "PathNotFound":
      return { status: 404, body: { tag: error._tag, error: message } };
    case "InvalidStatus":
    case "EmptyTitle":
    case "UnknownParent":
    case "GraphIntegrityError":
    case "LastNode":
    case "NotADirectory":
      return { status: 400, body: { tag: error._tag, error: message } };
    case "ProjectExists":
      return { status: 409, body: { tag: error._tag, error: message } };
    case "LockTimeout":
    case "IoError":
      return { status: 500, body: { tag: error._tag, error: message } };
  }
}

export function createApp(
  options: { pickFolder?: () => Promise<PickFolderResult> } = {},
) {
  const pickFolder = options.pickFolder ?? pickFolderNative;
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

  app.post("/project/pick-directory", async (c) => {
    try {
      const result = await pickFolder();
      if (!result.ok && result.reason === "unavailable") {
        return c.json(
          { tag: "FolderPickerUnavailable", error: "folder picker is unavailable" },
          503,
        );
      }
      if (!result.ok) {
        return c.json({ cancelled: true });
      }
      return c.json({ path: result.path });
    } catch (error) {
      return c.json({ tag: "UnknownError", error: String(error) }, 500);
    }
  });

  app.post("/project/init", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }

    const { path: dir } = (body ?? {}) as Record<string, unknown>;
    // path.resolve("") is the API process cwd.
    if (typeof dir !== "string" || dir.trim().length === 0) {
      return c.json({ error: "path is a required string" }, 400);
    }

    try {
      const data = await runCore(initProjectDir(path.resolve(dir)));
      return c.json(data);
    } catch (error) {
      if (isLinklikeError(error)) {
        const { status, body: responseBody } = coreResponse(error);
        return c.json(responseBody, status);
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

  app.put("/project/nodes/:id", async (c) => {
    const nodeId = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }

    const { path: dir, markdown } = (body ?? {}) as Record<string, unknown>;
    if (typeof dir !== "string" || typeof markdown !== "string") {
      return c.json({ error: "path and markdown are required strings" }, 400);
    }

    try {
      const written = await runCore(
        writeNodeContent(path.resolve(dir), nodeId, markdown),
      );
      return c.json({ id: nodeId, markdown: written });
    } catch (error) {
      if (isLinklikeError(error)) {
        const { status, body: responseBody } = coreResponse(error);
        return c.json(responseBody, status);
      }
      return c.json({ tag: "UnknownError", error: String(error) }, 500);
    }
  });

  app.post("/project/nodes", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "request body must be JSON" }, 400);
    }

    const { path: dir, title, parent } = (body ?? {}) as Record<string, unknown>;
    if (typeof dir !== "string" || typeof title !== "string") {
      return c.json({ error: "path and title are required strings" }, 400);
    }
    if (parent !== undefined && parent !== null && typeof parent !== "string") {
      return c.json({ error: "parent must be a string when provided" }, 400);
    }

    try {
      const result = await runCore(
        addNode(path.resolve(dir), {
          title,
          parent: typeof parent === "string" && parent.length > 0 ? parent : undefined,
        }),
      );
      return c.json(result);
    } catch (error) {
      if (isLinklikeError(error)) {
        const { status, body: responseBody } = coreResponse(error);
        return c.json(responseBody, status);
      }
      return c.json({ tag: "UnknownError", error: String(error) }, 500);
    }
  });

  app.delete("/project/nodes/:id", async (c) => {
    const dir = c.req.query("path");
    if (!dir) {
      return c.json({ error: "path query parameter is required" }, 400);
    }

    const nodeId = c.req.param("id");
    try {
      const result = await runCore(deleteNode(path.resolve(dir), nodeId));
      return c.json(result);
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
