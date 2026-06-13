export type NodeKind = "concept" | "process" | "entity" | "formula";

export interface GraphNode {
  id: string;
  label: string;
  summary: string;
  source_quote: string;
  kind: NodeKind;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraph {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ChartSeries {
  name: string;
  points: { label: string; value: number }[];
}

export interface ChartData {
  type: "bar" | "line" | "area" | "pie";
  x_label: string;
  y_label: string;
  series: ChartSeries[];
}

export interface Artifact {
  kind: "table" | "chart" | "note";
  title: string;
  table: TableData;
  chart: ChartData;
  note: { body: string };
}

export interface CanvasData {
  id: string;
  title: string;
  graph: KnowledgeGraph;
  layout: Record<string, { x: number; y: number }> | null;
}
