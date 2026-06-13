"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { Artifact } from "@/lib/types";

export type NoteNodeType = Node<{ artifact: Artifact }, "note">;

export function NoteNode({ data, selected }: NodeProps<NoteNodeType>) {
  const { title, note } = data.artifact;
  return (
    <div
      className={`node-enter glass w-[320px] rounded-2xl border border-emerald-400/25 p-4 shadow-[0_0_24px_rgba(52,211,153,0.08)] ${
        selected ? "ring-1 ring-emerald-300/60" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
      <div className="mb-2 text-[13px] font-semibold text-slate-100">{title}</div>
      <div className="space-y-2 text-[12px] leading-relaxed text-slate-300">
        {note.body.split(/\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
    </div>
  );
}
