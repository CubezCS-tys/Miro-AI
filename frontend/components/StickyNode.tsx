"use client";

import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useBoardActions } from "@/lib/board-context";
import { STICKY_STYLES, type ColorName } from "@/lib/colors";

export type StickyNodeType = Node<
  { text: string; color?: ColorName },
  "sticky"
>;

export function StickyNode({ id, data, selected }: NodeProps<StickyNodeType>) {
  const { updateNodeData } = useBoardActions();
  const colorClasses = STICKY_STYLES[data.color ?? "amber"];
  return (
    <div className="h-full w-full">
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={100}
        lineClassName="!border-amber-400/60"
        handleClassName="!h-2 !w-2 !rounded-sm !border-0 !bg-amber-400"
      />
      <div
        className={`node-enter h-full w-full rounded-xl border bg-gradient-to-br p-3 backdrop-blur-md transition-shadow ${colorClasses} ${
          selected ? "shadow-[0_0_20px_rgba(251,191,36,0.2)]" : ""
        }`}
      >
        <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500/60" />
        <textarea
          className="nodrag block h-full w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none"
          value={data.text}
          placeholder="Note…"
          autoFocus={data.text === ""}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
        />
        <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500/60" />
      </div>
    </div>
  );
}
