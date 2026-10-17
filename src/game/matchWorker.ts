/// <reference lib="webworker" />
/**
 * The match worker: plays one match per message with the same engine code as the main
 * thread, and posts the result back (see matchRunner.ts).
 */
import { playJob, type WorkerReply, type WorkerRequest } from './matchRunner';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, setup, ctx, mode } = ev.data;
  let reply: WorkerReply;
  try {
    reply = { id, result: playJob({ setup, ctx, mode }) };
  } catch (e) {
    reply = { id, error: e instanceof Error ? e.message : String(e) };
  }
  scope.postMessage(reply);
};
