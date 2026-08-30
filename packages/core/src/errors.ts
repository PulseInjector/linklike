import { Data } from "effect";

import type { ValidationIssue } from "./types.js";

export class InvalidProject extends Data.TaggedError("InvalidProject")<{
  readonly issues: readonly ValidationIssue[];
}> {}

export class InvalidNodeId extends Data.TaggedError("InvalidNodeId")<{
  readonly nodeId: string;
}> {}

export class UnknownNode extends Data.TaggedError("UnknownNode")<{
  readonly nodeId: string;
}> {}

export class UnknownParent extends Data.TaggedError("UnknownParent")<{
  readonly parentId: string;
}> {}

export class InvalidStatus extends Data.TaggedError("InvalidStatus")<{
  readonly status: string;
  readonly allowed: readonly string[];
}> {}

export class EmptyTitle extends Data.TaggedError("EmptyTitle") {}

export class LastNode extends Data.TaggedError("LastNode") {}

export class GraphIntegrityError extends Data.TaggedError("GraphIntegrityError")<{
  readonly messages: readonly string[];
}> {}

export class LockTimeout extends Data.TaggedError("LockTimeout")<{
  readonly projectDir: string;
}> {}

export class IoError extends Data.TaggedError("IoError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export type LinklikeError =
  | InvalidProject
  | InvalidNodeId
  | UnknownNode
  | UnknownParent
  | InvalidStatus
  | EmptyTitle
  | LastNode
  | GraphIntegrityError
  | LockTimeout
  | IoError;

export function linklikeErrorMessage(error: LinklikeError): string {
  switch (error._tag) {
    case "InvalidProject":
      return `project is invalid: ${error.issues.map((issue) => issue.message).join("; ")}`;
    case "InvalidNodeId":
      return `invalid node id: ${error.nodeId}`;
    case "UnknownNode":
      return `unknown node: ${error.nodeId}`;
    case "UnknownParent":
      return `unknown parent node: ${error.parentId}`;
    case "InvalidStatus":
      return `status must be one of: ${error.allowed.join(", ")}`;
    case "EmptyTitle":
      return "title must not be empty";
    case "LastNode":
      return "cannot delete the last remaining node";
    case "GraphIntegrityError":
      return error.messages.join("; ");
    case "LockTimeout":
      return `timed out acquiring project lock for ${error.projectDir}`;
    case "IoError":
      return `io error during ${error.operation}: ${String(error.cause)}`;
  }
}

export function isLinklikeError(error: unknown): error is LinklikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof (error as { _tag: unknown })._tag === "string"
  );
}
