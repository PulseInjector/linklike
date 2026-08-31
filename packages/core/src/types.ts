import type { PlanGraph, Progress, Project } from "@linklike/protocol";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export type FolderProbe =
  | { kind: "missing" }
  | { kind: "not-a-directory" }
  | { kind: "uninitialized" }
  | { kind: "ready" }
  | { kind: "invalid"; issues: ValidationIssue[] };

export interface ProjectData {
  project: Project;
  graph: PlanGraph;
  progress: Progress;
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

export interface RenameNodeResult {
  id: string;
  graph: PlanGraph;
}

export interface DeleteNodeResult {
  deletedIds: string[];
  graph: PlanGraph;
  progress: Progress;
}
