"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useBoardActions } from "@/lib/board-context";

export type TextNodeType = Node<{ text: string }, "text">;

export function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const { updateNodeData } = useBoardActions();
  return (
    <div
      className={`node-enter rounded-lg px-1 py-0.5 transition-shadow ${
        selected ? "ring-1 ring-accent" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-faint"
      />
      <textarea
        className="autosize nodrag block min-h-[28px] min-w-[160px] resize-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-faint"
        value={data.text}
        placeholder="Type something…"
        autoFocus={data.text === ""}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-faint"
      />
    </div>
  );
}
