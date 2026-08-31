import { useCallback, useEffect, useRef, useState } from "react";

import type { Progress, ProgressStatus } from "@linklike/protocol";

import {
  ApiError,
  createNode,
  deleteNode,
  fetchProject,
  initProject,
  pickDirectory,
  probeProject,
  type FolderProbe,
  type ProjectData,
} from "./api";
import { Map } from "./Map";
import { NodeDrawer } from "./NodeDrawer";
import "./App.css";

function readPathFromUrl(): string {
  return new URLSearchParams(window.location.search).get("path") ?? "";
}

function writePathToUrl(path: string): void {
  const url = new URL(window.location.href);
  if (path) {
    url.searchParams.set("path", path);
  } else {
    url.searchParams.delete("path");
  }
  window.history.replaceState(null, "", url.toString());
}

const PROBE_DEBOUNCE_MS = 300;

function displayIssue(message: string): string {
  if (!/ENOENT|no such file or directory/i.test(message)) {
    return message;
  }
  if (message.includes("project.json")) {
    return "project.json is missing";
  }
  if (message.includes("plan.graph.json")) {
    return "plan.graph.json is missing";
  }
  if (message.includes("progress.json")) {
    return "progress.json is missing";
  }
  return "A required project file is missing";
}

function folderNotice(probe: FolderProbe): string | null {
  switch (probe.kind) {
    case "uninitialized":
      return "This folder is not a Linklike project yet. Initialize it to create the map and notes.";
    case "missing":
      return "This path does not exist.";
    case "not-a-directory":
      return "This path is not a directory.";
    default:
      return null;
  }
}

export function App() {
  const [path, setPath] = useState<string>(readPathFromUrl);
  const [inputPath, setInputPath] = useState<string>(readPathFromUrl);
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState("Could not open this project.");
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [probe, setProbe] = useState<FolderProbe | null>(null);
  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [contentEpoch, setContentEpoch] = useState(0);

  const pathRef = useRef(path);
  const inputPathRef = useRef(inputPath);
  const loadGen = useRef(0);
  const probeGen = useRef(0);
  const progressGen = useRef(0);
  const graphGen = useRef(0);
  const dataPathRef = useRef<string | null>(null);
  pathRef.current = path;
  inputPathRef.current = inputPath;

  const applyProbe = useCallback((result: FolderProbe) => {
    setProbe(result);
    const nextNotice = folderNotice(result);
    setNotice(nextNotice);
    if (result.kind === "invalid") {
      setErrorTitle("Could not open this project.");
      setError("This folder looks like a Linklike project, but it is not valid.");
      setIssues(result.issues.map((issue) => displayIssue(issue.message)));
    } else {
      setError(null);
      setIssues([]);
    }
  }, []);

  const runProbe = useCallback(
    async (target: string, gen: number): Promise<FolderProbe | null> => {
      try {
        const result = await probeProject(target);
        if (gen !== probeGen.current) {
          return null;
        }
        applyProbe(result);
        return result;
      } catch (err) {
        if (gen !== probeGen.current) {
          return null;
        }
        setProbe(null);
        setNotice(null);
        setErrorTitle("Could not open this project.");
        if (err instanceof ApiError) {
          setError(err.message);
          setIssues(err.issues.map((issue) => displayIssue(issue.message)));
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        return null;
      }
    },
    [applyProbe],
  );

  const load = useCallback(async (target: string) => {
    const gen = ++loadGen.current;
    const progressAtStart = progressGen.current;
    const graphAtStart = graphGen.current;
    const shownPath = dataPathRef.current;
    setLoading(true);
    setError(null);
    setIssues([]);
    setNotice(null);
    try {
      const project = await fetchProject(target);
      // Ignore this response if the user switched path, reloaded, or left the project.
      if (gen !== loadGen.current || pathRef.current !== target) {
        return;
      }
      dataPathRef.current = target;
      setData((prev) => {
        if (!prev || shownPath !== target) {
          return project;
        }
        const keepProgress = progressGen.current !== progressAtStart;
        const keepGraph = graphGen.current !== graphAtStart;
        if (!keepProgress && !keepGraph) {
          return project;
        }
        return {
          ...project,
          progress: keepProgress ? prev.progress : project.progress,
          graph: keepGraph ? prev.graph : project.graph,
        };
      });
    } catch (err) {
      if (gen !== loadGen.current || pathRef.current !== target) {
        return;
      }
      if (dataPathRef.current !== target) {
        dataPathRef.current = null;
        setData(null);
      }
      setErrorTitle("Could not open this project.");
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => displayIssue(issue.message)));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    pathRef.current = path;
    if (!path) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await probeProject(path);
        // Draft edits do not change `path` until Open/Initialize.
        if (
          cancelled ||
          pathRef.current !== path ||
          inputPathRef.current.trim() !== path
        ) {
          return;
        }
        applyProbe(result);
        if (result.kind === "ready") {
          void load(path);
        }
      } catch (err) {
        if (
          cancelled ||
          pathRef.current !== path ||
          inputPathRef.current.trim() !== path
        ) {
          return;
        }
        setErrorTitle("Could not open this project.");
        if (err instanceof ApiError) {
          setError(err.message);
          setIssues(err.issues.map((issue) => displayIssue(issue.message)));
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, load, applyProbe]);

  useEffect(() => {
    const trimmed = inputPath.trim();
    if (data) {
      return;
    }
    if (!trimmed) {
      setProbe(null);
      setNotice(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const gen = ++probeGen.current;
      void runProbe(trimmed, gen);
    }, PROBE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [inputPath, data, runProbe]);

  const openPath = (trimmed: string) => {
    writePathToUrl(trimmed);
    pathRef.current = trimmed;
    if (trimmed === path) {
      void load(trimmed);
    } else {
      loadGen.current += 1;
      setPath(trimmed);
    }
  };

  const doInit = async (trimmed: string) => {
    setLoading(true);
    setError(null);
    setIssues([]);
    setNotice(null);
    try {
      await initProject(trimmed);
    } catch (err) {
      setLoading(false);
      setErrorTitle("Could not initialize this folder.");
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => displayIssue(issue.message)));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    openPath(trimmed);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputPath.trim();
    if (!trimmed || loading || picking) {
      return;
    }
    const gen = ++probeGen.current;
    // Disable Open until this probe settles so a retry cannot overlap it.
    setLoading(true);
    const latest = await runProbe(trimmed, gen);
    if (gen !== probeGen.current) {
      return;
    }
    if (latest?.kind === "uninitialized") {
      await doInit(trimmed);
      return;
    }
    if (latest?.kind === "ready") {
      openPath(trimmed);
      return;
    }
    setLoading(false);
  };

  const onBrowse = async () => {
    setPicking(true);
    try {
      const result = await pickDirectory();
      if ("path" in result) {
        setError(null);
        setIssues([]);
        setNotice(null);
        setProbe(null);
        setInputPath(result.path);
        const gen = ++probeGen.current;
        void runProbe(result.path, gen);
      }
    } catch (err) {
      setErrorTitle("Could not open this project.");
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => displayIssue(issue.message)));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPicking(false);
    }
  };

  const onPathChange = (value: string) => {
    setInputPath(value);
    probeGen.current += 1;
    setLoading(false);
    setProbe(null);
    setError(null);
    setIssues([]);
    setNotice(null);
  };

  const onOpenAnother = () => {
    loadGen.current += 1;
    probeGen.current += 1;
    dataPathRef.current = null;
    pathRef.current = "";
    setData(null);
    setError(null);
    setIssues([]);
    setNotice(null);
    setProbe(null);
    setSelectedId(null);
    setDrawerId(null);
    setLoading(false);
    setPath("");
    writePathToUrl("");
  };

  const onProgressUpdated = (progress: Progress) => {
    progressGen.current += 1;
    setData((prev) => (prev ? { ...prev, progress } : prev));
  };

  const onNodeAdded = (graph: ProjectData["graph"]) => {
    graphGen.current += 1;
    setError(null);
    setIssues([]);
    setData((prev) => (prev ? { ...prev, graph } : prev));
  };

  const onNodeDeleted = (
    graph: ProjectData["graph"],
    progress: Progress,
    deletedIds: string[],
  ) => {
    graphGen.current += 1;
    progressGen.current += 1;
    setError(null);
    setIssues([]);
    setData((prev) => (prev ? { ...prev, graph, progress } : prev));
    setSelectedId((current) =>
      current && deletedIds.includes(current) ? null : current,
    );
    setDrawerId((current) =>
      current && deletedIds.includes(current) ? null : current,
    );
  };

  const busy = loading || picking;
  const canInit = probe?.kind === "uninitialized";
  const canOpen = probe?.kind === "ready" || probe?.kind === "invalid";

  if (data) {
    return (
      <ProjectView
        data={data}
        path={path}
        selectedId={selectedId}
        drawerId={drawerId}
        error={error}
        issues={issues}
        onSelect={setSelectedId}
        onOpenNotes={(nodeId) => {
          setSelectedId(nodeId);
          setDrawerId(nodeId);
        }}
        onCloseDrawer={() => setDrawerId(null)}
        onProgressUpdated={onProgressUpdated}
        onNodeAdded={onNodeAdded}
        onNodeDeleted={onNodeDeleted}
        onMapError={(message) => {
          setError(message);
          setIssues([]);
        }}
        onOpenAnother={onOpenAnother}
        onReload={() => {
          setContentEpoch((epoch) => epoch + 1);
          void load(path);
        }}
        contentEpoch={contentEpoch}
      />
    );
  }

  return (
    <main className="home">
      <div className="home-card">
        <h1>Linklike</h1>
        <p className="subtitle">
          Open a local learning project, or initialize a folder.
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="path-input">Project directory (absolute path)</label>
          <div className="path-row">
            <input
              id="path-input"
              type="text"
              value={inputPath}
              placeholder="/home/you/learning/my-topic"
              onChange={(event) => onPathChange(event.target.value)}
              onBlur={() => {
                const trimmed = inputPath.trim();
                if (!trimmed || data) {
                  return;
                }
                const gen = ++probeGen.current;
                void runProbe(trimmed, gen);
              }}
              autoFocus
            />
            <button
              type="button"
              className="secondary"
              onClick={() => void onBrowse()}
              disabled={busy}
            >
              {picking ? "Browsing…" : "Browse"}
            </button>
          </div>
          <div className="home-actions">
            {canInit ? (
              <>
                <button type="submit" disabled={busy}>
                  {loading ? "Initializing…" : "Initialize"}
                </button>
                <button type="button" className="secondary" disabled>
                  Open project
                </button>
              </>
            ) : (
              <button type="submit" disabled={busy || !canOpen}>
                {loading ? "Opening…" : "Open project"}
              </button>
            )}
          </div>
        </form>
        {notice && (
          <div className="notice" role="status">
            <p>{notice}</p>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            <strong>{errorTitle}</strong>
            <p>{error}</p>
            {issues.length > 0 && (
              <ul>
                {issues.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ProjectView({
  data,
  path,
  selectedId,
  drawerId,
  error,
  issues,
  onSelect,
  onOpenNotes,
  onCloseDrawer,
  onProgressUpdated,
  onNodeAdded,
  onNodeDeleted,
  onMapError,
  onOpenAnother,
  onReload,
  contentEpoch,
}: {
  data: ProjectData;
  path: string;
  selectedId: string | null;
  drawerId: string | null;
  error: string | null;
  issues: string[];
  onSelect: (nodeId: string | null) => void;
  onOpenNotes: (nodeId: string) => void;
  onCloseDrawer: () => void;
  onProgressUpdated: (progress: Progress) => void;
  onNodeAdded: (graph: ProjectData["graph"]) => void;
  onNodeDeleted: (
    graph: ProjectData["graph"],
    progress: Progress,
    deletedIds: string[],
  ) => void;
  onMapError: (message: string) => void;
  onOpenAnother: () => void;
  onReload: () => void;
  contentEpoch: number;
}) {
  const drawerNode = drawerId
    ? (data.graph.nodes.find((node) => node.id === drawerId) ?? null)
    : null;
  const drawerStatus: ProgressStatus | null = drawerId
    ? (data.progress.entries[drawerId]?.status ?? null)
    : null;

  const addChild = useCallback(
    async (parentId: string, title: string) => {
      try {
        const result = await createNode(path, title, parentId);
        onNodeAdded(result.graph);
      } catch (err) {
        onMapError(err instanceof ApiError ? err.message : String(err));
        throw err;
      }
    },
    [path, onNodeAdded, onMapError],
  );

  const removeNode = useCallback(
    async (nodeId: string) => {
      try {
        const result = await deleteNode(path, nodeId);
        onNodeDeleted(result.graph, result.progress, result.deletedIds);
      } catch (err) {
        onMapError(err instanceof ApiError ? err.message : String(err));
        throw err;
      }
    },
    [path, onNodeDeleted, onMapError],
  );

  return (
    <div className="project">
      <header className="topbar">
        <div className="topbar-title">
          <strong>{data.project.name}</strong>
          <span className="topbar-path">{path}</span>
        </div>
        <div className="row">
          <button type="button" className="secondary" onClick={onReload}>
            Reload
          </button>
          <button type="button" className="secondary" onClick={onOpenAnother}>
            Open another
          </button>
        </div>
      </header>
      {error && (
        <div className="error project-error" role="alert">
          <strong>Could not refresh this project.</strong>
          <p>{error}</p>
          {issues.length > 0 && (
            <ul>
              {issues.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="workspace">
        <div className="map">
          <Map
            graph={data.graph}
            progress={data.progress}
            selectedId={selectedId}
            onSelect={onSelect}
            onOpenNotes={onOpenNotes}
            onAdd={addChild}
            onDelete={removeNode}
          />
        </div>
        {drawerNode && (
          <NodeDrawer
            key={`${drawerNode.id}:${contentEpoch}`}
            path={path}
            nodeId={drawerNode.id}
            title={drawerNode.title}
            status={drawerStatus}
            onStatusChange={onProgressUpdated}
            onClose={onCloseDrawer}
          />
        )}
      </div>
    </div>
  );
}
