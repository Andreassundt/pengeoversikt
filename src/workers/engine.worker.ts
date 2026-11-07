/// <reference lib="webworker" />
import { handleRequest } from './engine';
import type { EngineMessage, EngineReply } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<EngineMessage>) => {
  const { id, req } = event.data;
  try {
    const result = await handleRequest(req);
    const reply: EngineReply = { id, ok: true, result };
    self.postMessage(reply);
  } catch (err) {
    const reply: EngineReply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(reply);
  }
};
