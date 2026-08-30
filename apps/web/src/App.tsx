import { useCallback, useEffect, useState } from "react";

import type { Progress, ProgressStatus } from "@linklike/protocol";

import { ApiError, fetchProject, type ProjectData } from "./api";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contentEpoch, setContentEpoch] = useState(0);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setIssues([]);
    try {
      const project = await fetchProject(target);
      setData(project);
    } catch (err) {
      setData(null);
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err.issues.map((issue) => issue.message));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (path) {
      void load(path);
    }
  }, [path, load]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputPath.trim();
    if (!trimmed) {
      return;
    }
    writePathToUrl(trimmed);
    if (trimmed === path) {
      void load(trimmed);
    } else {
      setPath(trimmed);
    }
  };

  const onOpenAnother = () => {
    setData(null);
    setSelectedId(null);
    setPath("");
    writePathToUrl("");
  };

  const onProgressUpdated = (progress: Progress) => {
    setData((prev) => (prev ? { ...prev, progress } : prev));
  };

  if (data) {
    return (
      <ProjectView
        data={data}
        path={path}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCloseNode={() => setSelectedId(null)}
        onProgressUpdated={onProgressUpdated}
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
        <p className="subtitle">Open a local learning project to see its map.</p>
        <form onSubmit={onSubmit}>
          <label htmlFor="path-input">Project directory (absolute path)</label>
          <input
            id="path-input"
            type="text"
            value={inputPath}
            placeholder="/home/you/learning/my-topic"
            onChange={(event) => setInputPath(event.target.value)}
            autoFocus
          />
          <button type="submit" disabled={loading || !inputPath.trim()}>
            {loading ? "Opening…" : "Open project"}
          </button>
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
  onSelect,
  onCloseNode,
  onProgressUpdated,
  onOpenAnother,
  onReload,
  contentEpoch,
}: {
  data: ProjectData;
  path: string;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onCloseNode: () => void;
  onProgressUpdated: (progress: Progress) => void;
  onOpenAnother: () => void;
  onReload: () => void;
  contentEpoch: number;
}) {
  const selectedNode = selectedId
    ? (data.graph.nodes.find((node) => node.id === selectedId) ?? null)
    : null;
  const selectedStatus: ProgressStatus | null = selectedId
    ? (data.progress.entries[selectedId]?.status ?? null)
    : null;

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
      <div className="workspace">
        <div className="map">
          <Map
            graph={data.graph}
            progress={data.progress}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
        {selectedNode && (
          <NodeDrawer
            key={`${selectedNode.id}:${contentEpoch}`}
            path={path}
            nodeId={selectedNode.id}
            title={selectedNode.title}
            status={selectedStatus}
            onStatusChange={onProgressUpdated}
            onClose={onCloseNode}
          />
        )}
      </div>
    </div>
  );
}
