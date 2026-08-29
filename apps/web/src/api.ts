import type { PlanGraph, Progress, ProgressStatus, Project } from "@linklike/protocol";

export interface ProjectData {
  project: Project;
  graph: PlanGraph;
  progress: Progress;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.issues = issues;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: string;
      issues?: ValidationIssue[];
    };
    return new ApiError(
      body.error ?? `request failed (${res.status})`,
      body.issues ?? [],
    );
  } catch {
    return new ApiError(`request failed (${res.status})`);
  }
}

export async function fetchProject(path: string): Promise<ProjectData> {
  const res = await fetch(`/api/project?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as ProjectData;
}

export async function fetchNode(path: string, nodeId: string): Promise<string> {
  const res = await fetch(
    `/api/project/nodes/${encodeURIComponent(nodeId)}?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  const body = (await res.json()) as { markdown: string };
  return body.markdown;
}

export async function updateProgress(
  path: string,
  nodeId: string,
  status: ProgressStatus,
): Promise<Progress> {
  const res = await fetch(`/api/project/progress`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, nodeId, status }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  const body = (await res.json()) as { progress: Progress };
  return body.progress;
}
