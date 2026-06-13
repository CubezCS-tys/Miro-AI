"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { Artifact } from "@/lib/types";

export type TableNodeType = Node<{ artifact: Artifact }, "table">;

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const { title, table } = data.artifact;
  return (
    <div
      className={`node-enter node-surface min-w-[320px] max-w-[560px] rounded-2xl p-4 ${
        selected ? "!border-accent ring-1 ring-accent" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
      <div className="mb-3 text-[13px] font-semibold text-fg">{title}</div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-line-strong px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-citation"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-surface-2" : ""}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-line px-2.5 py-2 align-top text-[12px] leading-relaxed text-muted"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-faint" />
    </div>
  );
}
