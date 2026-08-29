import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  type Project,
  PROGRESS_STATUSES,
} from "@linklike/protocol";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ProjectData {
  project: Project;
  graph: PlanGraph;
  progress: Progress;
}

export type LoadResult =
  { ok: true; data: ProjectData } | { ok: false; issues: ValidationIssue[] };

const SAFE_NODE_ID = /^[A-Za-z0-9._-]+$/;

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

function projectPaths(projectDir: string) {
  return {
    projectPath: path.join(projectDir, "project.json"),
    graphPath: path.join(projectDir, "plan.graph.json"),
    progressPath: path.join(projectDir, "progress.json"),
  };
}

export async function validateProjectDir(
  projectDir: string,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  const { projectPath, graphPath, progressPath } = projectPaths(projectDir);

  let project;
  let graph;
  let progress;

  try {
    project = projectSchema.parse(await readJson(projectPath));
  } catch (error) {
    issues.push({
      code: "invalid_project",
      message: `project.json is invalid: ${String(error)}`,
    });
  }

  try {
    graph = planGraphSchema.parse(await readJson(graphPath));
  } catch (error) {
    issues.push({
      code: "invalid_graph",
      message: `plan.graph.json is invalid: ${String(error)}`,
    });
  }

  try {
    progress = progressSchema.parse(await readJson(progressPath));
  } catch (error) {
    issues.push({
      code: "invalid_progress",
      message: `progress.json is invalid: ${String(error)}`,
    });
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
      try {
        await readFile(nodePath, "utf8");
      } catch {
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
}

export async function loadProjectDir(projectDir: string): Promise<LoadResult> {
  const result = await validateProjectDir(projectDir);
  if (!result.ok) {
    return { ok: false, issues: result.issues };
  }

  const { projectPath, graphPath, progressPath } = projectPaths(projectDir);

  const data: ProjectData = {
    project: projectSchema.parse(await readJson(projectPath)),
    graph: planGraphSchema.parse(await readJson(graphPath)),
    progress: progressSchema.parse(await readJson(progressPath)),
  };

  return { ok: true, data };
}

export async function readNodeContent(
  projectDir: string,
  nodeId: string,
): Promise<string> {
  if (!SAFE_NODE_ID.test(nodeId)) {
    throw new Error(`invalid node id: ${nodeId}`);
  }

  const graph = planGraphSchema.parse(
    await readJson(path.join(projectDir, "plan.graph.json")),
  );

  if (!graph.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`unknown node: ${nodeId}`);
  }

  return readFile(path.join(projectDir, "nodes", `${nodeId}.mdx`), "utf8");
}

export async function setProgress(
  projectDir: string,
  nodeId: string,
  status: string,
): Promise<Progress> {
  if (!PROGRESS_STATUSES.includes(status as ProgressStatus)) {
    throw new Error(`status must be one of: ${PROGRESS_STATUSES.join(", ")}`);
  }

  const graph = planGraphSchema.parse(
    await readJson(path.join(projectDir, "plan.graph.json")),
  );

  if (!graph.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`unknown node: ${nodeId}`);
  }

  const { progressPath } = projectPaths(projectDir);
  const progress = progressSchema.parse(await readJson(progressPath));

  progress.entries[nodeId] = { status: status as ProgressStatus };

  await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  return progress;
}

export interface AddNodeOptions {
  title: string;
  parent?: string;
}

export interface AddNodeResult {
  id: string;
  graph: PlanGraph;
  nodeFileCreated: boolean;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function addNode(
  projectDir: string,
  options: AddNodeOptions,
): Promise<AddNodeResult> {
  const title = options.title.trim();
  if (!title) {
    throw new Error("title must not be empty");
  }

  const { graphPath } = projectPaths(projectDir);
  const graph = planGraphSchema.parse(await readJson(graphPath));

  if (options.parent && !graph.nodes.some((node) => node.id === options.parent)) {
    throw new Error(`unknown parent node: ${options.parent}`);
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
    throw new Error(integrityErrors.join("; "));
  }

  const nodePath = path.join(projectDir, "nodes", `${id}.mdx`);
  let nodeFileCreated = false;
  try {
    await readFile(nodePath, "utf8");
  } catch {
    await mkdir(path.join(projectDir, "nodes"), { recursive: true });
    await writeFile(nodePath, `# ${title}\n\nStart your notes here.\n`);
    nodeFileCreated = true;
  }

  await writeFile(graphPath, `${JSON.stringify(validated, null, 2)}\n`);

  return { id, graph: validated, nodeFileCreated };
}
