"use client";

import { useMemo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Artifact } from "@/lib/types";

export type ChartNodeType = Node<{ artifact: Artifact }, "chart">;

const PALETTE = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#60a5fa"];

const axisStyle = { fontSize: 10, fill: "#64748b" };
const tooltipStyle = {
  contentStyle: {
    background: "rgba(13,18,32,0.95)",
    border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#e2e8f0" },
};

export function ChartNode({ data, selected }: NodeProps<ChartNodeType>) {
  const { title, chart } = data.artifact;

  // recharts wants one row per x-label with a column per series
  const rows = useMemo(() => {
    const byLabel = new Map<string, Record<string, string | number>>();
    for (const s of chart.series) {
      for (const p of s.points) {
        const row = byLabel.get(p.label) ?? { label: p.label };
        row[s.name] = p.value;
        byLabel.set(p.label, row);
      }
    }
    return [...byLabel.values()];
  }, [chart]);

  const W = 380;
  const H = 240;
  const multi = chart.series.length > 1;

  let body: React.ReactNode;
  if (chart.type === "pie") {
    const pieData = chart.series[0]?.points.map((p) => ({
      name: p.label,
      value: p.value,
    }));
    body = (
      <PieChart width={W} height={H}>
        <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={85} label={{ fontSize: 10, fill: "#94a3b8" }}>
          {pieData?.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    );
  } else {
    const ChartComp = chart.type === "line" ? LineChart : chart.type === "area" ? AreaChart : BarChart;
    body = (
      <ChartComp width={W} height={H} data={rows}>
        <CartesianGrid stroke="rgba(148,163,184,0.1)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} stroke="rgba(148,163,184,0.25)" />
        <YAxis tick={axisStyle} stroke="rgba(148,163,184,0.25)" width={45} />
        <Tooltip {...tooltipStyle} />
        {multi && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {chart.series.map((s, i) => {
          const color = PALETTE[i % PALETTE.length];
          if (chart.type === "line")
            return <Line key={s.name} dataKey={s.name} stroke={color} strokeWidth={2} dot={{ r: 3 }} />;
          if (chart.type === "area")
            return <Area key={s.name} dataKey={s.name} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} />;
          return <Bar key={s.name} dataKey={s.name} fill={color} radius={[4, 4, 0, 0]} />;
        })}
      </ChartComp>
    );
  }

  return (
    <div
      className={`node-enter glass rounded-2xl border border-violet-400/25 p-4 shadow-[0_0_24px_rgba(167,139,250,0.08)] ${
        selected ? "ring-1 ring-violet-300/60" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
      <div className="mb-1 text-[13px] font-semibold text-slate-100">{title}</div>
      {chart.y_label && (
        <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
          {chart.y_label}
          {chart.x_label ? ` | by ${chart.x_label}` : ""}
        </div>
      )}
      {body}
      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
    </div>
  );
}
