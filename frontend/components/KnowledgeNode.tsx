"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { GraphNode } from "@/lib/types";

export type KnowledgeNodeType = Node<{ concept: GraphNode }, "knowledge">;

const kindAccents: Record<
  string,
  { border: string; glow: string; dot: string; text: string }
> = {
  concept: {
    border: "border-cyan-400/40",
    glow: "hover:shadow-[0_0_24px_rgba(34,211,238,0.25)]",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
  },
  process: {
    border: "border-emerald-400/40",
    glow: "hover:shadow-[0_0_24px_rgba(52,211,153,0.25)]",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  },
  entity: {
    border: "border-amber-400/40",
    glow: "hover:shadow-[0_0_24px_rgba(251,191,36,0.25)]",
    dot: "bg-amber-400",
    text: "text-amber-300",
  },
  formula: {
    border: "border-violet-400/40",
    glow: "hover:shadow-[0_0_24px_rgba(167,139,250,0.3)]",
    dot: "bg-violet-400",
    text: "text-violet-300",
  },
};

export function KnowledgeNode({ data, selected }: NodeProps<KnowledgeNodeType>) {
  const { concept } = data;
  const accent = kindAccents[concept.kind] ?? kindAccents.concept;
  return (
    <div
      className={`node-enter glass w-[200px] cursor-pointer rounded-xl border px-3.5 py-2.5 transition-all duration-200 ${accent.border} ${accent.glow} ${
        selected
          ? "shadow-[0_0_32px_rgba(56,189,248,0.35)] ring-1 ring-cyan-300/60"
          : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-500"
      />
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
        <span
          className={`text-[9px] font-medium uppercase tracking-[0.14em] ${accent.text}`}
        >
          {concept.kind}
        </span>
      </div>
      <div className="text-[13px] font-semibold leading-snug text-slate-100">
        {concept.label}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-500"
      />
    </div>
  );
}
