"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { Artifact } from "@/lib/types";

export type NoteNodeType = Node<{ artifact: Artifact }, "note">;

export function NoteNode({ data, selected }: NodeProps<NoteNodeType>) {
  const { title, note } = data.artifact;
  return (
    <div
      className={`node-enter node-surface w-[320px] rounded-2xl p-4 ${
        selected ? "!border-accent ring-1 ring-accent" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
      <div className="mb-2 text-[13px] font-semibold text-fg">{title}</div>
      <div className="space-y-2 text-[12px] leading-relaxed text-muted">
        {note.body.split(/\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
    </div>
  );
}
