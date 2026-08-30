import { Cause, Effect, Exit } from "effect";

import { type LinklikeError } from "./errors.js";

export const runCore = <A, E extends LinklikeError>(
  effect: Effect.Effect<A, E>,
): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isFailure(exit)) {
      return Promise.reject(Cause.squash(exit.cause));
    }
    return exit.value;
  });

export const runCoreEffect = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isFailure(exit)) {
      return Promise.reject(Cause.squash(exit.cause));
    }
    return exit.value;
  });
