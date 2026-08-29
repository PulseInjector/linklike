import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  planGraphSchema,
  progressSchema,
  projectSchema,
  validateGraphIntegrity,
  validateProgressKeys,
} from "@linklike/protocol";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

export async function validateProjectDir(
  projectDir: string,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  const projectPath = path.join(projectDir, "project.json");
  const graphPath = path.join(projectDir, "plan.graph.json");
  const progressPath = path.join(projectDir, "progress.json");

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
