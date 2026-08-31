import type {
  PlanGraph,
  Progress,
  ProgressWriteStatus,
  Project,
} from "@linklike/protocol";

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
  readonly tag: string | undefined;
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = [], tag?: string) {
    super(message);
    this.name = "ApiError";
    this.tag = tag;
    this.issues = issues;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      tag?: string;
      error?: string;
      issues?: ValidationIssue[];
    };
    return new ApiError(
      body.error ?? `request failed (${res.status})`,
      body.issues ?? [],
      body.tag,
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

export async function writeNode(
  path: string,
  nodeId: string,
  markdown: string,
): Promise<string> {
  const res = await fetch(`/api/project/nodes/${encodeURIComponent(nodeId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, markdown }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  const body = (await res.json()) as { markdown: string };
  return body.markdown;
}

export async function updateProgress(
  path: string,
  nodeId: string,
  status: ProgressWriteStatus,
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

export async function createNode(
  path: string,
  title: string,
  parent?: string,
): Promise<{ id: string; graph: PlanGraph; nodeFileCreated: boolean }> {
  const res = await fetch("/api/project/nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, title, parent }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as {
    id: string;
    graph: PlanGraph;
    nodeFileCreated: boolean;
  };
}

export async function renameNode(
  path: string,
  nodeId: string,
  title: string,
): Promise<{ id: string; graph: PlanGraph }> {
  const res = await fetch(`/api/project/nodes/${encodeURIComponent(nodeId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, title }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as { id: string; graph: PlanGraph };
}

export async function deleteNode(
  path: string,
  nodeId: string,
): Promise<{ deletedIds: string[]; graph: PlanGraph; progress: Progress }> {
  const res = await fetch(
    `/api/project/nodes/${encodeURIComponent(nodeId)}?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as {
    deletedIds: string[];
    graph: PlanGraph;
    progress: Progress;
  };
}

export async function initProject(path: string): Promise<ProjectData> {
  const res = await fetch("/api/project/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as ProjectData;
}

export type FolderProbe =
  | { kind: "missing" }
  | { kind: "not-a-directory" }
  | { kind: "uninitialized" }
  | { kind: "ready" }
  | { kind: "invalid"; issues: ValidationIssue[] };

export async function probeProject(path: string): Promise<FolderProbe> {
  const res = await fetch(`/api/project/probe?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as FolderProbe;
}

export async function pickDirectory(): Promise<{ path: string } | { cancelled: true }> {
  const res = await fetch("/api/project/pick-directory", { method: "POST" });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as { path: string } | { cancelled: true };
}
