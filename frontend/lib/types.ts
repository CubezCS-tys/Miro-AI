export type NodeKind = "concept" | "process" | "entity" | "formula";

export interface SourceSpan {
  page: number;
  start_char: number | null;
  end_char: number | null;
  quote: string;
  verified: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  summary: string;
  source_quote: string;
  source_page?: number | null;
  source_span?: SourceSpan | null;
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

export interface RuntimeConfig {
  server_execution_enabled: boolean;
  max_upload_bytes: number;
  max_prompt_chars: number;
  max_code_chars: number;
  provider: string;
  quality_model: string;
  light_model: string;
  privacy_boundary: string;
}

export interface BoardSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  page_count: number;
  size_bytes: number;
  created_at: string;
}

export interface TutorQuestion {
  question: string;
  why: string;
  source_page: number | null;
  source_quote: string;
}

export interface TutorResponse {
  title: string;
  questions: TutorQuestion[];
  weak_links: string[];
}
