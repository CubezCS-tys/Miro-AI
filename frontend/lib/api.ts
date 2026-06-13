import type {
  ArenaAnswerResponse,
  ArenaFinishResponse,
  ArenaSession,
  Artifact,
  BoardSummary,
  CanvasData,
  DocumentPage,
  DocumentSummary,
  FrontierProposalResponse,
  GraphNode,
  RuntimeConfig,
  TutorResponse,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function check<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function uploadDocument(
  file: File,
): Promise<{
  document_id: string;
  filename: string;
  chars: number;
  page_count: number;
}> {
  const form = new FormData();
  form.append("file", file);
  return check(await fetch(`${API}/documents`, { method: "POST", body: form }));
}

export async function getConfig(): Promise<RuntimeConfig> {
  return check(await fetch(`${API}/config`));
}

export function terminalWebSocketUrl(cols: number, rows: number): string {
  const url = new URL("/terminal/sessions", API);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("cols", String(cols));
  url.searchParams.set("rows", String(rows));
  return url.toString();
}

export async function listDocuments(): Promise<{ documents: DocumentSummary[] }> {
  return check(await fetch(`${API}/documents`));
}

export async function getDocumentPage(
  documentId: string,
  page: number,
): Promise<DocumentPage> {
  return check(await fetch(`${API}/documents/${documentId}/pages/${page}`));
}

export async function analyzeDocument(
  documentId: string,
  intent?: string | null,
  boardId = "default",
): Promise<{ canvas_id: string; title: string }> {
  return check(
    await fetch(`${API}/documents/${documentId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: intent ?? null, board_id: boardId }),
    }),
  );
}

export async function getCanvas(canvasId: string): Promise<CanvasData> {
  return check(await fetch(`${API}/canvas/${canvasId}`));
}

export async function generateArtifacts(
  prompt: string,
  documentIds: string[],
  selection: { label: string; summary: string }[],
): Promise<{ artifacts: Artifact[] }> {
  return check(
    await fetch(`${API}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        document_ids: documentIds,
        selection,
      }),
    }),
  );
}

export async function getTutor(
  selection: Pick<GraphNode, "label" | "summary" | "source_quote" | "source_page" | "source_span">[],
  focus?: string | null,
): Promise<TutorResponse> {
  return check(
    await fetch(`${API}/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection, focus: focus ?? null }),
    }),
  );
}

export async function expandFrontier(input: {
  board_id: string;
  query?: string | null;
  selection: (Pick<
    GraphNode,
    "id" | "label" | "summary" | "source_quote" | "source_page" | "source_span" | "kind"
  > & { node_id?: string })[];
  source_types?: string[];
  budget?: string;
}): Promise<FrontierProposalResponse> {
  return check(
    await fetch(`${API}/research/frontier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: input.board_id,
        query: input.query ?? null,
        selection: input.selection,
        source_types: input.source_types ?? ["mock"],
        budget: input.budget ?? "cheap",
      }),
    }),
  );
}

export async function acceptFrontierProposal(
  proposalId: string,
): Promise<FrontierProposalResponse> {
  return check(
    await fetch(`${API}/research/proposals/${proposalId}/accept`, {
      method: "POST",
    }),
  );
}

export async function rejectFrontierProposal(
  proposalId: string,
): Promise<{ proposal_id: string; status: "rejected" }> {
  return check(
    await fetch(`${API}/research/proposals/${proposalId}/reject`, {
      method: "POST",
    }),
  );
}

export async function createArenaSession(input: {
  board_id: string;
  selected_nodes: (GraphNode & { node_id?: string })[];
  mode?: string;
}): Promise<ArenaSession> {
  return check(
    await fetch(`${API}/tutor/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: input.board_id,
        selected_nodes: input.selected_nodes,
        mode: input.mode ?? "socratic",
      }),
    }),
  );
}

export async function answerArenaQuestion(
  sessionId: string,
  answer: string,
): Promise<ArenaAnswerResponse> {
  return check(
    await fetch(`${API}/tutor/sessions/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    }),
  );
}

export async function finishArenaSession(
  sessionId: string,
): Promise<ArenaFinishResponse> {
  return check(
    await fetch(`${API}/tutor/sessions/${sessionId}/finish`, {
      method: "POST",
    }),
  );
}

export interface CodeResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timed_out: boolean;
}

export async function executeCode(code: string): Promise<CodeResult> {
  return check(
    await fetch(`${API}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

export interface BoardState {
  nodes: unknown[];
  edges: unknown[];
}

export async function listBoards(): Promise<{ boards: BoardSummary[] }> {
  return check(await fetch(`${API}/boards`));
}

export async function createBoard(title: string): Promise<BoardSummary> {
  return check(
    await fetch(`${API}/boards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
}

export async function getBoard(boardId = "default"): Promise<BoardState> {
  const path = boardId === "default" ? "/board" : `/boards/${boardId}`;
  return check(await fetch(`${API}${path}`));
}

export async function saveBoard(state: BoardState, boardId = "default"): Promise<void> {
  const path = boardId === "default" ? "/board" : `/boards/${boardId}`;
  await check(
    await fetch(`${API}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }),
  );
}

export async function saveLayout(
  canvasId: string,
  layout: Record<string, { x: number; y: number }>,
): Promise<void> {
  await check(
    await fetch(`${API}/canvas/${canvasId}/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    }),
  );
}
