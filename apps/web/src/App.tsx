import { useCallback, useEffect, useRef, useState } from "react";

import type { Progress, ProgressStatus } from "@linklike/protocol";

import {
  ApiError,
  createNode,
  deleteNode,
  fetchProject,
  initProject,
  pickDirectory,
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

export function App() {
  const [path, setPath] = useState<string>(readPathFromUrl);
  const [inputPath, setInputPath] = useState<string>(readPathFromUrl);
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [contentEpoch, setContentEpoch] = useState(0);

  const pathRef = useRef(path);
  const loadGen = useRef(0);
  const progressGen = useRef(0);
  const graphGen = useRef(0);
  const dataPathRef = useRef<string | null>(null);

  const load = useCallback(async (target: string) => {
    const gen = ++loadGen.current;
    const progressAtStart = progressGen.current;
    const graphAtStart = graphGen.current;
    const shownPath = dataPathRef.current;
    setLoading(true);
    setError(null);
    setIssues([]);
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
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => issue.message));
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
    if (path) {
      void load(path);
    }
  }, [path, load]);

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

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputPath.trim();
    if (!trimmed) {
      return;
    }
    openPath(trimmed);
  };

  const onInit = async (event: React.MouseEvent) => {
    event.preventDefault();
    const trimmed = inputPath.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError(null);
    setIssues([]);
    try {
      await initProject(trimmed);
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => issue.message));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    openPath(trimmed);
  };

  const onBrowse = async () => {
    setPicking(true);
    try {
      const result = await pickDirectory();
      if ("path" in result) {
        setError(null);
        setIssues([]);
        setInputPath(result.path);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => issue.message));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPicking(false);
    }
  };

  const onOpenAnother = () => {
    loadGen.current += 1;
    dataPathRef.current = null;
    pathRef.current = "";
    setData(null);
    setError(null);
    setIssues([]);
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
              onChange={(event) => setInputPath(event.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="secondary"
              onClick={() => void onBrowse()}
              disabled={loading || picking}
            >
              {picking ? "Browsing…" : "Browse"}
            </button>
          </div>
          <div className="home-actions">
            <button type="submit" disabled={loading || picking || !inputPath.trim()}>
              {loading ? "Opening…" : "Open project"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={(event) => void onInit(event)}
              disabled={loading || picking || !inputPath.trim()}
            >
              Initialize
            </button>
          </div>
        </form>
        {error && (
          <div className="error" role="alert">
            <strong>Could not open this project.</strong>
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
