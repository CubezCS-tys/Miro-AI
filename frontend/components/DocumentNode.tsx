"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useBoardActions } from "@/lib/board-context";
import { FileIcon } from "./icons";

export interface DocumentMeta {
  filename: string;
  documentId?: string;
  status: "uploading" | "pending" | "analyzing" | "ready" | "error";
  title?: string;
  error?: string;
  nodeCount?: number;
  pageCount?: number;
  [key: string]: unknown;
}

export type DocumentNodeType = Node<DocumentMeta, "document">;

const PRESETS = [
  { label: "Concept map", intent: null },
  {
    label: "Process / flow",
    intent:
      "Map the processes and sequences: what happens, in what order, what causes what.",
  },
  {
    label: "Key arguments",
    intent:
      "Map the claims, the evidence for them, and the counterpoints - an argument map.",
  },
] as const;

function BriefForm({ nodeId }: { nodeId: string }) {
  const { generateFromDocument } = useBoardActions();
  const [preset, setPreset] = useState(0);
  const [focus, setFocus] = useState("");

  const submit = () => {
    const parts = [PRESETS[preset].intent, focus.trim() ? `Focus on: ${focus.trim()}` : null]
      .filter(Boolean)
      .join(" ");
    generateFromDocument(nodeId, parts || null);
  };

  return (
    <div className="nodrag mt-3 border-t border-line pt-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
        What do you want from it?
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setPreset(i)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              preset === i
                ? "bg-accent text-accent-fg"
                : "bg-surface-2 text-muted hover:text-fg"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Optional: focus on a topic, question, chapter..."
        className="mb-2.5 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent"
      />
      <button
        onClick={submit}
        className="w-full rounded-lg bg-accent py-1.5 text-[12px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
      >
        Generate map
      </button>
    </div>
  );
}

export function DocumentNode({ id, data }: NodeProps<DocumentNodeType>) {
  return (
    <div
      className={`node-enter node-surface w-[260px] rounded-2xl px-4 py-3.5 ${
        data.status === "analyzing" || data.status === "uploading"
          ? "pulse-ring !border-accent/60"
          : data.status === "error"
            ? "!border-contradiction/60"
            : data.status === "pending"
              ? "!border-accent/40"
              : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <FileIcon size={18} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-fg">
            {data.title ?? data.filename}
          </div>
          {data.status === "uploading" && (
            <div className="shimmer-text text-[11px] font-medium">Reading...</div>
          )}
          {data.status === "pending" && (
            <div className="text-[11px] text-accent">
              {data.pageCount ? `${data.pageCount} pages ready` : "Ready when you are"}
            </div>
          )}
          {data.status === "analyzing" && (
            <div className="shimmer-text text-[11px] font-medium">
              Mapping concepts...
            </div>
          )}
          {data.status === "ready" && (
            <div className="text-[11px] text-muted">
              {data.nodeCount} concepts extracted
            </div>
          )}
          {data.status === "error" && (
            <div className="text-[11px] text-contradiction">{data.error}</div>
          )}
        </div>
      </div>

      {data.status === "pending" && <BriefForm nodeId={id} />}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-faint"
      />
    </div>
  );
}
