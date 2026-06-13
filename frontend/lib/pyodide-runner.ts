"use client";

import type { CodeResult } from "./api";

/* Client-side Python via a Pyodide web worker. The worker is shared across
   all code blocks; a hung execution kills and replaces it. */

interface Pending {
  resolve: (r: CodeResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let warmedUp = false;
let seq = 0;
const pending = new Map<number, Pending>();

const RUN_TIMEOUT_MS = 30_000;
// first run also downloads the ~12MB runtime
const COLD_START_TIMEOUT_MS = 120_000;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/pyodide-worker.js");
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "ready") {
        warmedUp = true;
        return;
      }
      if (e.data.type === "result") {
        const p = pending.get(e.data.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(e.data.id);
          p.resolve(e.data.result as CodeResult);
        }
      }
    };
  }
  return worker;
}

export function runPythonInBrowser(code: string): Promise<CodeResult> {
  return new Promise((resolve) => {
    const id = ++seq;
    const w = getWorker();
    const timeoutMs = warmedUp ? RUN_TIMEOUT_MS : COLD_START_TIMEOUT_MS;
    const timer = setTimeout(() => {
      pending.delete(id);
      // the worker is stuck — replace it so the next run starts clean
      worker?.terminate();
      worker = null;
      warmedUp = false;
      resolve({
        stdout: "",
        stderr: `Execution timed out after ${Math.round(timeoutMs / 1000)}s (sandbox restarted)`,
        exit_code: -1,
        duration_ms: timeoutMs,
        timed_out: true,
      });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, code });
  });
}
