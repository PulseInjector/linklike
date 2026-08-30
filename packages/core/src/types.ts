import type { PlanGraph, Progress, Project } from "@linklike/protocol";

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

export interface AddNodeOptions {
  title: string;
  parent?: string;
}

export interface AddNodeResult {
  id: string;
  graph: PlanGraph;
  nodeFileCreated: boolean;
}
