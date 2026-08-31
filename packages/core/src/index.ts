import {
  mkdir,
  open,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  planGraphSchema,
  progressSchema,
  projectSchema,
  subtreeNodeIds,
  validateGraphIntegrity,
  validateProgressKeys,
  type PlanGraph,
  type Progress,
  type ProgressStatus,
  type ProgressWriteStatus,
  PROGRESS_CLEAR_STATUS,
  PROGRESS_WRITE_STATUSES,
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
  LastNode,
  linklikeErrorMessage,
  LockTimeout,
  NotADirectory,
  PathNotFound,
  ProjectExists,
  UnknownNode,
  UnknownParent,
  type LinklikeError,
} from "./errors.js";
import { runCoreEffect } from "./runtime.js";
import { moveToOsTrash } from "./trash.js";
import type {
  AddNodeOptions,
  AddNodeResult,
  DeleteNodeResult,
  ProjectData,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export type {
  AddNodeOptions,
  AddNodeResult,
  DeleteNodeResult,
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
  LastNode,
  LockTimeout,
  NotADirectory,
  PathNotFound,
  ProjectExists,
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

const statPath = (
  filePath: string,
): Effect.Effect<Awaited<ReturnType<typeof stat>> | null, IoError> =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await stat(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    catch: (cause) => new IoError({ operation: `stat ${filePath}`, cause }),
  });

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

const writeNewText = (
  filePath: string,
  content: string,
  projectDir: string,
): Effect.Effect<void, IoError | ProjectExists> =>
  Effect.tryPromise({
    try: () => writeFile(filePath, content, { flag: "wx" }),
    catch: (cause) => {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
        return new ProjectExists({ projectDir });
      }
      return new IoError({ operation: `write ${filePath}`, cause });
    },
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

const INIT_RELATIVE_PATHS = [
  "project.json",
  "plan.graph.json",
  "progress.json",
  path.join("nodes", "root.mdx"),
] as const;

export const initProjectDir = (
  projectDir: string,
): Effect.Effect<
  ProjectData,
  PathNotFound | NotADirectory | ProjectExists | LockTimeout | IoError
> => {
  const resolved = path.resolve(projectDir);

  return Effect.gen(function* () {
    const info = yield* statPath(resolved);
    if (info === null) {
      return yield* Effect.fail(new PathNotFound({ projectDir: resolved }));
    }
    if (!info.isDirectory()) {
      return yield* Effect.fail(new NotADirectory({ projectDir: resolved }));
    }

    // Stat before locking: lock file lives inside the project directory.
    return yield* withProjectLock(
      resolved,
      Effect.gen(function* () {
        for (const relative of INIT_RELATIVE_PATHS) {
          const existing = yield* statPath(path.join(resolved, relative));
          if (existing !== null) {
            return yield* Effect.fail(new ProjectExists({ projectDir: resolved }));
          }
        }

        const name = path.basename(resolved) || "project";
        const now = new Date().toISOString();
        const { projectPath, graphPath, progressPath } = projectPaths(resolved);
        const nodesDir = path.join(resolved, "nodes");
        const rootNotePath = path.join(nodesDir, "root.mdx");
        const created: string[] = [];
        let createdNodesDir = false;

        const nodesBefore = yield* statPath(nodesDir);
        yield* Effect.tryPromise({
          try: () => mkdir(nodesDir, { recursive: true }),
          catch: (cause) => new IoError({ operation: `mkdir ${nodesDir}`, cause }),
        });
        createdNodesDir = nodesBefore === null;

        const project = { version: 1 as const, name, createdAt: now };
        const graph = {
          version: 1 as const,
          nodes: [{ id: "root", title: name }],
          edges: [] as { from: string; to: string }[],
        };
        const progress = {
          version: 1 as const,
          entries: { root: { status: "learning" as const } },
        };

        const rollback = Effect.tryPromise({
          try: async () => {
            for (const filePath of [...created].reverse()) {
              await unlink(filePath).catch(() => undefined);
            }
            if (createdNodesDir) {
              await rmdir(nodesDir).catch(() => undefined);
            }
          },
          catch: () => undefined,
        }).pipe(Effect.ignore);

        return yield* Effect.gen(function* () {
          yield* writeNewText(
            projectPath,
            `${JSON.stringify(project, null, 2)}\n`,
            resolved,
          );
          created.push(projectPath);
          yield* writeNewText(
            graphPath,
            `${JSON.stringify(graph, null, 2)}\n`,
            resolved,
          );
          created.push(graphPath);
          yield* writeNewText(
            progressPath,
            `${JSON.stringify(progress, null, 2)}\n`,
            resolved,
          );
          created.push(progressPath);
          yield* writeNewText(
            rootNotePath,
            `# ${name}\n\nStart your notes here.\n`,
            resolved,
          );
          created.push(rootNotePath);
          return { project, graph, progress };
        }).pipe(
          // Leftover markers would make retry fail with ProjectExists.
          Effect.tapError(() => rollback),
        );
      }),
    );
  });
};

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
): Effect.Effect<
  Progress,
  InvalidStatus | InvalidProject | UnknownNode | LockTimeout | IoError
> => {
  if (!PROGRESS_WRITE_STATUSES.includes(status as ProgressWriteStatus)) {
    return Effect.fail(
      new InvalidStatus({ status, allowed: [...PROGRESS_WRITE_STATUSES] }),
    );
  }

  const { graphPath, progressPath } = projectPaths(projectDir);

  // Graph read + progress RMW share the lock so a concurrent addNode write cannot tear plan.graph.json.
  return withProjectLock(
    projectDir,
    Effect.gen(function* () {
      const existingProject = yield* validateProjectDir(projectDir);
      if (!existingProject.ok) {
        return yield* Effect.fail(
          new InvalidProject({ issues: existingProject.issues }),
        );
      }

      const graph = planGraphSchema.parse(yield* readJson(graphPath));
      if (!graph.nodes.some((node) => node.id === nodeId)) {
        return yield* Effect.fail(new UnknownNode({ nodeId }));
      }

      const progress = progressSchema.parse(yield* readJson(progressPath));
      // pending matches roadmap.sh reset; drop the entry instead of storing it.
      if (status === PROGRESS_CLEAR_STATUS) {
        delete progress.entries[nodeId];
      } else {
        progress.entries[nodeId] = { status: status as ProgressStatus };
      }
      yield* writeText(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      return progress;
    }),
  );
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

export const deleteNode = (
  projectDir: string,
  nodeId: string,
): Effect.Effect<
  DeleteNodeResult,
  | InvalidNodeId
  | UnknownNode
  | LastNode
  | InvalidProject
  | GraphIntegrityError
  | LockTimeout
  | IoError
> => {
  if (!SAFE_NODE_ID.test(nodeId)) {
    return Effect.fail(new InvalidNodeId({ nodeId }));
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

      const { graphPath, progressPath } = projectPaths(projectDir);
      const graph = planGraphSchema.parse(yield* readJson(graphPath));
      if (!graph.nodes.some((node) => node.id === nodeId)) {
        return yield* Effect.fail(new UnknownNode({ nodeId }));
      }

      const deletedIds = subtreeNodeIds(graph, nodeId);
      if (deletedIds.size >= graph.nodes.length) {
        return yield* Effect.fail(new LastNode());
      }

      const nextGraph: PlanGraph = {
        ...graph,
        nodes: graph.nodes.filter((node) => !deletedIds.has(node.id)),
        edges: graph.edges.filter(
          (edge) => !deletedIds.has(edge.from) && !deletedIds.has(edge.to),
        ),
      };
      const validated = planGraphSchema.parse(nextGraph);
      const integrityErrors = validateGraphIntegrity(validated);
      if (integrityErrors.length > 0) {
        return yield* Effect.fail(
          new GraphIntegrityError({ messages: integrityErrors }),
        );
      }

      const progress = progressSchema.parse(yield* readJson(progressPath));
      for (const id of deletedIds) {
        delete progress.entries[id];
      }

      // Extra progress keys are invalid; missing keys are not. Write progress first so a
      // later graph-write failure cannot strand an illegal project.
      yield* writeText(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
      yield* writeText(graphPath, `${JSON.stringify(validated, null, 2)}\n`);

      for (const id of deletedIds) {
        const nodePath = path.join(projectDir, "nodes", `${id}.mdx`);
        const exists = yield* readText(nodePath).pipe(
          Effect.as(true),
          Effect.catchAll(() => Effect.succeed(false)),
        );
        if (exists) {
          // Graph is already committed; leftover notes are extra files, not InvalidProject.
          yield* moveToOsTrash(nodePath).pipe(Effect.catchAll(() => Effect.void));
        }
      }

      return { deletedIds: [...deletedIds], graph: validated, progress };
    }),
  );
};

export const writeNodeContent = (
  projectDir: string,
  nodeId: string,
  body: string,
): Effect.Effect<
  string,
  InvalidNodeId | UnknownNode | InvalidProject | LockTimeout | IoError
> => {
  if (!SAFE_NODE_ID.test(nodeId)) {
    return Effect.fail(new InvalidNodeId({ nodeId }));
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

      const graphPath = path.join(projectDir, "plan.graph.json");
      const json = yield* readJson(graphPath);
      const graph = planGraphSchema.parse(json);

      if (!graph.nodes.some((node) => node.id === nodeId)) {
        return yield* Effect.fail(new UnknownNode({ nodeId }));
      }

      const nodePath = path.join(projectDir, "nodes", `${nodeId}.mdx`);
      yield* writeText(nodePath, body);
      return body;
    }),
  );
};
