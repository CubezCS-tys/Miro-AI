"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useBoardActions } from "@/lib/board-context";

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
    <div className="nodrag mt-3 border-t border-white/8 pt-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
        What do you want from it?
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setPreset(i)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              preset === i
                ? "bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-300/50"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
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
        className="mb-2.5 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
      />
      <button
        onClick={submit}
        className="w-full rounded-lg bg-gradient-to-r from-cyan-500/90 to-violet-500/90 py-1.5 text-[12px] font-semibold text-white transition-all hover:shadow-[0_0_20px_rgba(56,189,248,0.35)]"
      >
        Generate map
      </button>
    </div>
  );
}

export function DocumentNode({ id, data }: NodeProps<DocumentNodeType>) {
  return (
    <div
      className={`node-enter glass w-[260px] rounded-2xl border px-4 py-3.5 ${
        data.status === "analyzing" || data.status === "uploading"
          ? "pulse-ring border-cyan-400/50"
          : data.status === "error"
            ? "border-red-400/50"
            : data.status === "pending"
              ? "border-violet-400/40 shadow-[0_0_24px_rgba(139,92,246,0.15)]"
              : "border-slate-400/30 shadow-[0_0_20px_rgba(148,163,184,0.12)]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-base">
          📄
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-slate-100">
            {data.title ?? data.filename}
          </div>
          {data.status === "uploading" && (
            <div className="shimmer-text text-[11px] font-medium">Reading...</div>
          )}
          {data.status === "pending" && (
            <div className="text-[11px] text-violet-300">
              {data.pageCount ? `${data.pageCount} pages ready` : "Ready when you are"}
            </div>
          )}
          {data.status === "analyzing" && (
            <div className="shimmer-text text-[11px] font-medium">
              Mapping concepts...
            </div>
          )}
          {data.status === "ready" && (
            <div className="text-[11px] text-slate-400">
              {data.nodeCount} concepts extracted
            </div>
          )}
          {data.status === "error" && (
            <div className="text-[11px] text-red-400">{data.error}</div>
          )}
        </div>
      </div>

      {data.status === "pending" && <BriefForm nodeId={id} />}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-500"
      />
    </div>
  );
}
