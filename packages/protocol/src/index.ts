import { z } from "zod";

export const PROGRESS_STATUSES = ["learning", "done", "skip"] as const;
export const PROGRESS_CLEAR_STATUS = "pending" as const;
export const PROGRESS_WRITE_STATUSES = [
  ...PROGRESS_STATUSES,
  PROGRESS_CLEAR_STATUS,
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type ProgressWriteStatus = (typeof PROGRESS_WRITE_STATUSES)[number];

export const projectSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

export const graphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const planGraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(graphNodeSchema).min(1),
  edges: z.array(graphEdgeSchema),
});

export const progressEntrySchema = z.object({
  status: z.enum(PROGRESS_STATUSES),
});

export const progressSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), progressEntrySchema),
});

export type Project = z.infer<typeof projectSchema>;
export type PlanGraph = z.infer<typeof planGraphSchema>;
export type Progress = z.infer<typeof progressSchema>;

export function validateGraphIntegrity(graph: PlanGraph): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));

  if (ids.size !== graph.nodes.length) {
    errors.push("plan.graph.json contains duplicate node ids");
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.from)) {
      errors.push(`edge references missing node: ${edge.from}`);
    }
    if (!ids.has(edge.to)) {
      errors.push(`edge references missing node: ${edge.to}`);
    }
  }

  return errors;
}

export function validateProgressKeys(graph: PlanGraph, progress: Progress): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));

  for (const nodeId of Object.keys(progress.entries)) {
    if (!ids.has(nodeId)) {
      errors.push(`progress entry references missing node: ${nodeId}`);
    }
  }

  return errors;
}
