"use client";

import { useCallback, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
  type Node,
} from "@xyflow/react";

import { executeCode, getConfig, type CodeResult } from "@/lib/api";
import { runPythonInBrowser } from "@/lib/pyodide-runner";
import { useBoardActions } from "@/lib/board-context";

export type Runtime = "browser" | "server";

export type CodeNodeType = Node<
  { code: string; result?: CodeResult | null; runtime?: Runtime },
  "code"
>;

export function CodeNode({ id, data, selected }: NodeProps<CodeNodeType>) {
  const { updateNodeData } = useBoardActions();
  const [running, setRunning] = useState(false);
  const [serverAllowed, setServerAllowed] = useState(false);
  const runtime: Runtime = data.runtime ?? "browser";

  useEffect(() => {
    void getConfig()
      .then((config) => setServerAllowed(config.server_execution_enabled))
      .catch(() => setServerAllowed(false));
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    if (runtime === "server" && !serverAllowed) {
      updateNodeData(id, {
        result: {
          stdout: "",
          stderr: "Server Python execution is disabled. Switch to browser runtime.",
          exit_code: -1,
          duration_ms: 0,
          timed_out: false,
        },
      });
      return;
    }
    setRunning(true);
    try {
      const result =
        runtime === "browser"
          ? await runPythonInBrowser(data.code)
          : await executeCode(data.code);
      updateNodeData(id, { result });
    } catch (e) {
      updateNodeData(id, {
        result: {
          stdout: "",
          stderr: e instanceof Error ? e.message : "Execution failed",
          exit_code: -1,
          duration_ms: 0,
          timed_out: false,
        },
      });
    } finally {
      setRunning(false);
    }
  }, [running, runtime, serverAllowed, data.code, id, updateNodeData]);

  const result = data.result;

  return (
    <div
      className={`node-surface flex h-full w-full flex-col overflow-hidden rounded-2xl ${
        selected ? "!border-accent ring-1 ring-accent" : ""
      }`}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          void run();
        }
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={320}
        minHeight={240}
        lineClassName="!border-accent"
        handleClassName="!h-2 !w-2 !rounded-sm !border-0 !bg-accent"
      />
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />

      {/* header - also the drag grip */}
      <div className="flex shrink-0 cursor-grab items-center gap-2 border-b border-line px-3 py-2 active:cursor-grabbing">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-contradiction/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">
          Python
        </span>
        <button
          onClick={() =>
            updateNodeData(id, {
              runtime: runtime === "browser" ? "server" : "browser",
            })
          }
          disabled={runtime === "browser" && !serverAllowed}
          className="nodrag rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          title={
            runtime === "browser"
              ? serverAllowed
                ? "Runs in your browser WebAssembly sandbox. Click to use server Python."
                : "Server Python is disabled by backend policy."
              : "Runs on backend Python. Click to use the browser sandbox."
          }
        >
          {runtime === "browser" ? "browser" : serverAllowed ? "server" : "server locked"}
        </button>
        <span className="ml-auto flex items-center gap-2">
          {result && !running && (
            <span
              className={`font-mono text-[10px] ${
                result.exit_code === 0 ? "text-success" : "text-contradiction"
              }`}
            >
              exit {result.exit_code} | {result.duration_ms}ms
            </span>
          )}
          <button
            onClick={() => void run()}
            disabled={running}
            className="nodrag rounded-lg bg-success/15 px-3 py-1 text-[11px] font-semibold text-success ring-1 ring-success/40 transition-colors hover:bg-success/25 disabled:opacity-50"
            title="Run (Ctrl+Enter)"
          >
            {running ? <span className="shimmer-text">Running...</span> : "Run"}
          </button>
        </span>
      </div>

      {/* editor */}
      <div className="nodrag nowheel min-h-0 flex-1 cursor-text overflow-hidden text-[12px]">
        <CodeMirror
          value={data.code}
          height="100%"
          theme={tokyoNight}
          extensions={[python()]}
          onChange={(value) => updateNodeData(id, { code: value })}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            autocompletion: true,
          }}
          style={{ height: "100%" }}
        />
      </div>

      {/* terminal */}
      <div className="nodrag nowheel h-[34%] shrink-0 overflow-auto border-t border-line bg-surface-2 px-3 py-2 font-mono text-[11px] leading-relaxed">
        {!result && !running && (
          <span className="text-faint">$ output appears here - Run or Ctrl+Enter</span>
        )}
        {running && <span className="shimmer-text">$ running...</span>}
        {result && !running && (
          <>
            {result.stdout && (
              <pre className="whitespace-pre-wrap text-fg">{result.stdout}</pre>
            )}
            {result.stderr && (
              <pre className="whitespace-pre-wrap text-contradiction">{result.stderr}</pre>
            )}
            {!result.stdout && !result.stderr && (
              <span className="text-faint">(no output)</span>
            )}
          </>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
    </div>
  );
}
