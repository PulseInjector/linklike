import { useEffect, useState } from "react";

import Markdown from "react-markdown";

import {
  PROGRESS_CLEAR_STATUS,
  PROGRESS_STATUSES,
  type Progress,
  type ProgressStatus,
  type ProgressWriteStatus,
} from "@linklike/protocol";

import { ApiError, fetchNode, updateProgress } from "./api";

const STATUS_LABEL: Record<ProgressStatus, string> = {
  learning: "Learning",
  done: "Done",
  skip: "Skip",
};

export function NodeDrawer({
  path,
  nodeId,
  title,
  status,
  onStatusChange,
  onClose,
}: {
  path: string;
  nodeId: string;
  title: string;
  status: ProgressStatus | null;
  onStatusChange: (progress: Progress) => Promise<void> | void;
  onClose: () => void;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ProgressWriteStatus | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setMarkdown(null);

    fetchNode(path, nodeId)
      .then((content) => {
        if (active) {
          setMarkdown(content);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : String(err));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [path, nodeId]);

  const setStatus = async (next: ProgressStatus) => {
    const write: ProgressWriteStatus = status === next ? PROGRESS_CLEAR_STATUS : next;
    setSaving(write);
    setError(null);
    try {
      const progress = await updateProgress(path, nodeId, write);
      await onStatusChange(progress);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <aside className="drawer">
      <div className="drawer-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="drawer-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="drawer-status">
        {PROGRESS_STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            className={`status-btn${status === option ? " active" : ""}`}
            aria-pressed={status === option}
            title={status === option ? "Click again to reset" : undefined}
            disabled={saving !== null}
            onClick={() => void setStatus(option)}
          >
            {saving === option ||
            (saving === PROGRESS_CLEAR_STATUS && status === option)
              ? "Saving…"
              : STATUS_LABEL[option]}
          </button>
        ))}
      </div>

      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="drawer-body">
        {loading && <p className="muted">Loading note…</p>}
        {!loading && markdown !== null && (
          <div className="markdown">
            <Markdown>{markdown}</Markdown>
          </div>
        )}
      </div>
    </aside>
  );
}
