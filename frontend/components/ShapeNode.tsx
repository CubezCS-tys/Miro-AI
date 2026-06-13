"use client";

import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useBoardActions } from "@/lib/board-context";
import { SHAPE_STYLES, type ColorName } from "@/lib/colors";

export type ShapeKind = "rect" | "ellipse" | "diamond";

export type ShapeNodeType = Node<
  { label: string; shape: ShapeKind; color?: ColorName },
  "shape"
>;

export function ShapeNode({ id, data, selected }: NodeProps<ShapeNodeType>) {
  const { updateNodeData } = useBoardActions();
  const colorClasses = SHAPE_STYLES[data.color ?? "cyan"];

  const shapeClasses =
    data.shape === "ellipse"
      ? "rounded-[50%] border-2"
      : data.shape === "rect"
        ? "rounded-xl border-2"
        : ""; // diamond drawn via clip-path below

  return (
    <div className="h-full w-full">
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={60}
        lineClassName="!border-cyan-400/60"
        handleClassName="!h-2 !w-2 !rounded-sm !border-0 !bg-cyan-400"
      />
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
      <div
        className={`flex h-full w-full items-center justify-center ${shapeClasses} ${colorClasses} ${
          data.shape === "diamond" ? "[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" : ""
        } ${selected ? "shadow-[0_0_24px_rgba(56,189,248,0.2)]" : ""}`}
      >
        <textarea
          className={`autosize nodrag max-h-full resize-none bg-transparent text-center text-[13px] font-medium leading-snug text-slate-100 outline-none placeholder:text-slate-500 ${
            data.shape === "diamond" ? "max-w-[55%]" : "max-w-[85%]"
          }`}
          value={data.label}
          placeholder="Label"
          rows={1}
          onChange={(e) => updateNodeData(id, { label: e.target.value })}
        />
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
    </div>
  );
}
