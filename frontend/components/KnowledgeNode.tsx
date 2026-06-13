"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { GraphNode } from "@/lib/types";

export type KnowledgeNodeType = Node<{ concept: GraphNode }, "knowledge">;

const handleClass = "!h-1.5 !w-1.5 !border-0 !bg-faint";

export function KnowledgeNode({ data, selected }: NodeProps<KnowledgeNodeType>) {
  const { concept } = data;
  const source = concept.source_span;
  const page = source?.page ?? concept.source_page;
  const verified = source?.verified ?? false;
  return (
    <div
      className={`node-enter node-surface w-[200px] cursor-pointer px-3.5 py-2.5 ${
        selected ? "ring-2 ring-accent" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 bg-fg" />
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted">
          {concept.kind}
        </span>
        {page && (
          <span
            className={`source-chip ml-auto border px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted ${
              verified ? "border-line" : "border-dashed border-line"
            }`}
            title={verified ? "Verified source page" : "Quote needs review"}
          >
            p{page}
          </span>
        )}
      </div>
      <div className="text-[13px] font-semibold leading-snug text-fg">
        {concept.label}
      </div>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
}
