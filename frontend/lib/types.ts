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
  kind?: "supports" | "contradicts" | "context" | string;
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
  document_id: string;
  title: string;
  graph: KnowledgeGraph;
  layout: Record<string, { x: number; y: number }> | null;
}

export interface DocumentPage {
  document_id: string;
  filename: string;
  page: number;
  page_count: number;
  text: string;
  start_char: number | null;
  end_char: number | null;
}

export interface RuntimeConfig {
  server_execution_enabled: boolean;
  live_research_enabled: boolean;
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

export interface FrontierSource {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  local_path: string | null;
  sha256: string | null;
  content_text: string;
  metadata: Record<string, unknown>;
}

export interface FrontierClaim {
  id: string;
  source_id: string;
  text: string;
  quote: string;
  page: number | null;
  start_char: number | null;
  end_char: number | null;
  url_anchor: string | null;
  stance: "supports" | "contradicts" | "context" | string;
  confidence: number;
}

export interface FrontierProposal {
  board_id: string;
  query: string;
  budget: string;
  sources: FrontierSource[];
  claims: FrontierClaim[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FrontierProposalResponse {
  proposal_id: string;
  status: "pending" | "accepted" | "rejected";
  proposal: FrontierProposal;
}

export interface ArenaQuestion {
  id: string;
  kind: string;
  node_id: string;
  node_label: string;
  question: string;
  source_page: number | null;
  source_quote: string;
}

export interface ArenaMasteryItem {
  label: string;
  state: "unknown" | "shaky" | "solid" | string;
  score: number;
}

export interface ArenaEvaluation {
  verdict: "unsupported" | "partial" | "solid" | string;
  score: number;
  state: string;
  feedback: string;
  missing: string[];
}

export interface ArenaSession {
  session_id: string;
  status: string;
  mode: string;
  mastery: Record<string, ArenaMasteryItem>;
  current_question: ArenaQuestion | null;
  selected_nodes: GraphNode[];
}

export interface ArenaAnswerResponse {
  session_id: string;
  evaluation: ArenaEvaluation;
  mastery: Record<string, ArenaMasteryItem>;
  next_question: ArenaQuestion | null;
  complete: boolean;
}

export interface ArenaFinishResponse {
  session_id: string;
  status: string;
  flashcards: { front: string; back: string; node_id: string }[];
  presentation_path: {
    step: number;
    node_id: string;
    title: string;
    source_page: number | null;
  }[];
  graph_revision: {
    summary: string;
    weak_node_ids: string[];
    proposed_edges: GraphEdge[];
  };
}
