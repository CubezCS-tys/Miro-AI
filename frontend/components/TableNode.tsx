"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { Artifact } from "@/lib/types";

export type TableNodeType = Node<{ artifact: Artifact }, "table">;

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const { title, table } = data.artifact;
  return (
    <div
      className={`node-enter glass min-w-[320px] max-w-[560px] rounded-2xl border border-cyan-400/25 p-4 shadow-[0_0_24px_rgba(34,211,238,0.08)] ${
        selected ? "ring-1 ring-cyan-300/60" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
      <div className="mb-3 text-[13px] font-semibold text-slate-100">{title}</div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-cyan-400/20 px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-300/90"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-white/[0.025]" : ""}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-white/5 px-2.5 py-2 align-top text-[12px] leading-relaxed text-slate-300"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
    </div>
  );
}
