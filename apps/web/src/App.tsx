import { useCallback, useEffect, useState } from "react";

import { ApiError, fetchProject, type ProjectData } from "./api";
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
    setPath(trimmed);
  };

  const onOpenAnother = () => {
    setData(null);
    setPath("");
    writePathToUrl("");
  };

  if (data) {
    return (
      <ProjectSummary
        data={data}
        path={path}
        onOpenAnother={onOpenAnother}
        onReload={() => void load(path)}
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

function ProjectSummary({
  data,
  path,
  onOpenAnother,
  onReload,
}: {
  data: ProjectData;
  path: string;
  onOpenAnother: () => void;
  onReload: () => void;
}) {
  return (
    <main className="home">
      <div className="home-card">
        <h1>{data.project.name}</h1>
        <p className="subtitle">{path}</p>
        <p>
          {data.graph.nodes.length} node
          {data.graph.nodes.length === 1 ? "" : "s"} · map coming next.
        </p>
        <div className="row">
          <button type="button" onClick={onReload}>
            Reload
          </button>
          <button type="button" className="secondary" onClick={onOpenAnother}>
            Open another
          </button>
        </div>
      </div>
    </main>
  );
}
