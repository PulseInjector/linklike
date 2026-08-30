import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  planGraphSchema,
  progressSchema,
  projectSchema,
  validateGraphIntegrity,
  validateProgressKeys,
  type PlanGraph,
  type Progress,
  type ProgressStatus,
  PROGRESS_STATUSES,
} from "@linklike/protocol";
import { Effect } from "effect";

import {
  EmptyTitle,
  GraphIntegrityError,
  InvalidNodeId,
  InvalidProject,
  InvalidStatus,
  IoError,
  isLinklikeError,
  linklikeErrorMessage,
  LockTimeout,
  UnknownNode,
  UnknownParent,
  type LinklikeError,
} from "./errors.js";
import { runCoreEffect } from "./runtime.js";
import type {
  AddNodeOptions,
  AddNodeResult,
  ProjectData,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export type {
  AddNodeOptions,
  AddNodeResult,
  ProjectData,
  ValidationIssue,
  ValidationResult,
} from "./types.js";
export {
  EmptyTitle,
  GraphIntegrityError,
  InvalidNodeId,
  InvalidProject,
  InvalidStatus,
  IoError,
  LockTimeout,
  UnknownNode,
  UnknownParent,
  isLinklikeError,
  linklikeErrorMessage,
  type LinklikeError,
} from "./errors.js";
export { runCore, runCoreEffect } from "./runtime.js";

const SAFE_NODE_ID = /^[A-Za-z0-9._-]+$/;
const LOCK_FILE = ".linklike.lock";
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;

type LockHandle = Awaited<ReturnType<typeof open>>;

const readJson = (filePath: string): Effect.Effect<unknown, IoError> =>
  Effect.tryPromise({
    try: async () => {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as unknown;
    },
    catch: (cause) => new IoError({ operation: `read ${filePath}`, cause }),
  });

const readText = (filePath: string): Effect.Effect<string, IoError> =>
  Effect.tryPromise({
    try: () => readFile(filePath, "utf8"),
    catch: (cause) => new IoError({ operation: `read ${filePath}`, cause }),
  });

const writeText = (filePath: string, content: string): Effect.Effect<void, IoError> =>
  Effect.tryPromise({
    try: () => writeFile(filePath, content),
    catch: (cause) => new IoError({ operation: `write ${filePath}`, cause }),
  });

function projectPaths(projectDir: string) {
  return {
    projectPath: path.join(projectDir, "project.json"),
    graphPath: path.join(projectDir, "plan.graph.json"),
    progressPath: path.join(projectDir, "progress.json"),
  };
}

const acquireProjectLock = (
  projectDir: string,
): Effect.Effect<LockHandle, LockTimeout | IoError> =>
  Effect.gen(function* () {
    const lockPath = path.join(path.resolve(projectDir), LOCK_FILE);
    const deadline = Date.now() + LOCK_WAIT_MS;

    while (Date.now() < deadline) {
      const opened = yield* Effect.tryPromise({
        try: () => open(lockPath, "wx"),
        catch: (cause) => cause as NodeJS.ErrnoException,
      }).pipe(
        Effect.matchEffect({
          onFailure: (error) => {
            if (error.code === "EEXIST") {
              return Effect.succeed(null as LockHandle | null);
            }
            return Effect.fail(
              new IoError({ operation: `open ${lockPath}`, cause: error }),
            );
          },
          onSuccess: (handle) => Effect.succeed(handle),
        }),
      );

      if (opened !== null) {
        yield* Effect.tryPromise({
          try: () => opened.writeFile(String(process.pid)),
          catch: (cause) => new IoError({ operation: `write ${lockPath}`, cause }),
        });
        return opened;
      }

      const stale = yield* Effect.tryPromise({
        try: async (): Promise<boolean> => {
          try {
            const info = await stat(lockPath);
            return Date.now() - info.mtimeMs > LOCK_STALE_MS;
          } catch {
            return false;
          }
        },
        catch: (cause) => new IoError({ operation: `stat ${lockPath}`, cause }),
      });

      if (stale) {
        yield* Effect.tryPromise({
          try: async () => {
            await unlink(lockPath).catch(() => undefined);
          },
          catch: (cause) => new IoError({ operation: `unlink ${lockPath}`, cause }),
        });
        continue;
      }

      yield* Effect.sleep("10 millis");
    }

    return yield* Effect.fail(new LockTimeout({ projectDir }));
  });

const releaseProjectLock = (
  projectDir: string,
  handle: LockHandle,
): Effect.Effect<void, never> => {
  const lockPath = path.join(path.resolve(projectDir), LOCK_FILE);
  return Effect.tryPromise({
    try: async () => {
      await handle.close();
      await unlink(lockPath).catch(() => undefined);
    },
    catch: () => undefined,
  }).pipe(Effect.ignore);
};

const projectLocks = new Map<string, Promise<void>>();

const withProjectLock = <A, E extends LinklikeError>(
  projectDir: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E | LockTimeout | IoError> => {
  const key = path.resolve(projectDir);
  const previous = projectLocks.get(key) ?? Promise.resolve();

  const run = previous.then(() =>
    runCoreEffect(
      Effect.gen(function* () {
        const handle = yield* acquireProjectLock(projectDir);
        return yield* effect.pipe(
          Effect.ensuring(releaseProjectLock(projectDir, handle)),
        );
      }),
    ),
  );

  projectLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );

  return Effect.tryPromise({
    try: () => run,
    catch: (cause): E | LockTimeout | IoError =>
      isLinklikeError(cause)
        ? (cause as E | LockTimeout | IoError)
        : new IoError({ operation: "withProjectLock", cause }),
  });
};

export const validateProjectDir = (
  projectDir: string,
): Effect.Effect<ValidationResult, IoError> =>
  Effect.gen(function* () {
    const issues: ValidationIssue[] = [];
    const { projectPath, graphPath, progressPath } = projectPaths(projectDir);

    let project;
    let graph;
    let progress;

    const projectJson = yield* readJson(projectPath).pipe(
      Effect.catchAll((error) => {
        issues.push({
          code: "invalid_project",
          message: `project.json is invalid: ${linklikeErrorMessage(error)}`,
        });
        return Effect.succeed(undefined);
      }),
    );
    if (projectJson !== undefined) {
      try {
        project = projectSchema.parse(projectJson);
      } catch (error) {
        issues.push({
          code: "invalid_project",
          message: `project.json is invalid: ${String(error)}`,
        });
      }
    }

    const graphJson = yield* readJson(graphPath).pipe(
      Effect.catchAll((error) => {
        issues.push({
          code: "invalid_graph",
          message: `plan.graph.json is invalid: ${linklikeErrorMessage(error)}`,
        });
        return Effect.succeed(undefined);
      }),
    );
    if (graphJson !== undefined) {
      try {
        graph = planGraphSchema.parse(graphJson);
      } catch (error) {
        issues.push({
          code: "invalid_graph",
          message: `plan.graph.json is invalid: ${String(error)}`,
        });
      }
    }

    const progressJson = yield* readJson(progressPath).pipe(
      Effect.catchAll((error) => {
        issues.push({
          code: "invalid_progress",
          message: `progress.json is invalid: ${linklikeErrorMessage(error)}`,
        });
        return Effect.succeed(undefined);
      }),
    );
    if (progressJson !== undefined) {
      try {
        progress = progressSchema.parse(progressJson);
      } catch (error) {
        issues.push({
          code: "invalid_progress",
          message: `progress.json is invalid: ${String(error)}`,
        });
      }
    }

    if (graph) {
      for (const message of validateGraphIntegrity(graph)) {
        issues.push({ code: "graph_integrity", message });
      }
    }

    if (graph && progress) {
      for (const message of validateProgressKeys(graph, progress)) {
        issues.push({ code: "progress_integrity", message });
      }
    }

    if (graph) {
      for (const node of graph.nodes) {
        const nodePath = path.join(projectDir, "nodes", `${node.id}.mdx`);
        const exists = yield* readText(nodePath).pipe(
          Effect.as(true),
          Effect.catchAll(() => Effect.succeed(false)),
        );
        if (!exists) {
          issues.push({
            code: "missing_node_file",
            message: `missing nodes/${node.id}.mdx`,
          });
        }
      }
    }

    if (project && issues.length === 0) {
      void project;
    }

    return { ok: issues.length === 0, issues };
  });

const readProjectData = (projectDir: string): Effect.Effect<ProjectData, IoError> =>
  Effect.gen(function* () {
    const { projectPath, graphPath, progressPath } = projectPaths(projectDir);
    const [projectJson, graphJson, progressJson] = yield* Effect.all([
      readJson(projectPath),
      readJson(graphPath),
      readJson(progressPath),
    ]);

    return {
      project: projectSchema.parse(projectJson),
      graph: planGraphSchema.parse(graphJson),
      progress: progressSchema.parse(progressJson),
    };
  });

export const loadProjectDir = (
  projectDir: string,
): Effect.Effect<ProjectData, InvalidProject | IoError> =>
  Effect.gen(function* () {
    const result = yield* validateProjectDir(projectDir);
    if (!result.ok) {
      return yield* Effect.fail(new InvalidProject({ issues: result.issues }));
    }
    return yield* readProjectData(projectDir);
  });

export const readNodeContent = (
  projectDir: string,
  nodeId: string,
): Effect.Effect<string, InvalidNodeId | UnknownNode | IoError> =>
  Effect.gen(function* () {
    if (!SAFE_NODE_ID.test(nodeId)) {
      return yield* Effect.fail(new InvalidNodeId({ nodeId }));
    }

    const graphPath = path.join(projectDir, "plan.graph.json");
    const json = yield* readJson(graphPath);
    const graph = planGraphSchema.parse(json);

    if (!graph.nodes.some((node) => node.id === nodeId)) {
      return yield* Effect.fail(new UnknownNode({ nodeId }));
    }

    return yield* readText(path.join(projectDir, "nodes", `${nodeId}.mdx`));
  });

export const setProgress = (
  projectDir: string,
  nodeId: string,
  status: string,
): Effect.Effect<Progress, InvalidStatus | UnknownNode | LockTimeout | IoError> => {
  if (!PROGRESS_STATUSES.includes(status as ProgressStatus)) {
    return Effect.fail(new InvalidStatus({ status, allowed: [...PROGRESS_STATUSES] }));
  }

  const graphPath = path.join(projectDir, "plan.graph.json");
  const { progressPath } = projectPaths(projectDir);

  return Effect.gen(function* () {
    const graph = planGraphSchema.parse(yield* readJson(graphPath));

    if (!graph.nodes.some((node) => node.id === nodeId)) {
      return yield* Effect.fail(new UnknownNode({ nodeId }));
    }

    return yield* withProjectLock(
      projectDir,
      Effect.gen(function* () {
        const progress = progressSchema.parse(yield* readJson(progressPath));
        progress.entries[nodeId] = { status: status as ProgressStatus };
        yield* writeText(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
        return progress;
      }),
    );
  });
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const addNode = (
  projectDir: string,
  options: AddNodeOptions,
): Effect.Effect<
  AddNodeResult,
  | EmptyTitle
  | InvalidProject
  | UnknownParent
  | GraphIntegrityError
  | LockTimeout
  | IoError
> => {
  const title = options.title.trim();
  if (!title) {
    return Effect.fail(new EmptyTitle());
  }

  return withProjectLock(
    projectDir,
    Effect.gen(function* () {
      const existingProject = yield* validateProjectDir(projectDir);
      if (!existingProject.ok) {
        return yield* Effect.fail(
          new InvalidProject({ issues: existingProject.issues }),
        );
      }

      const { graphPath } = projectPaths(projectDir);
      const graph = planGraphSchema.parse(yield* readJson(graphPath));

      if (options.parent && !graph.nodes.some((node) => node.id === options.parent)) {
        return yield* Effect.fail(new UnknownParent({ parentId: options.parent }));
      }

      const base = slugify(title) || "node";
      const existing = new Set(graph.nodes.map((node) => node.id));
      let id = base;
      let suffix = 2;
      while (existing.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }

      const nextGraph: PlanGraph = {
        ...graph,
        nodes: [...graph.nodes, { id, title }],
        edges: options.parent
          ? [...graph.edges, { from: options.parent, to: id }]
          : [...graph.edges],
      };

      const validated = planGraphSchema.parse(nextGraph);
      const integrityErrors = validateGraphIntegrity(validated);
      if (integrityErrors.length > 0) {
        return yield* Effect.fail(
          new GraphIntegrityError({ messages: integrityErrors }),
        );
      }

      const nodePath = path.join(projectDir, "nodes", `${id}.mdx`);
      const nodeExists = yield* readText(nodePath).pipe(
        Effect.as(true),
        Effect.catchAll(() => Effect.succeed(false)),
      );

      let nodeFileCreated = false;
      if (!nodeExists) {
        yield* Effect.tryPromise({
          try: () => mkdir(path.join(projectDir, "nodes"), { recursive: true }),
          catch: (cause) =>
            new IoError({
              operation: `mkdir ${path.join(projectDir, "nodes")}`,
              cause,
            }),
        });
        yield* writeText(nodePath, `# ${title}\n\nStart your notes here.\n`);
        nodeFileCreated = true;
      }

      yield* writeText(graphPath, `${JSON.stringify(validated, null, 2)}\n`);

      return { id, graph: validated, nodeFileCreated };
    }),
  );
};
