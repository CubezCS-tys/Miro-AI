import type {
  Artifact,
  BoardSummary,
  CanvasData,
  DocumentSummary,
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

export async function listDocuments(): Promise<{ documents: DocumentSummary[] }> {
  return check(await fetch(`${API}/documents`));
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
