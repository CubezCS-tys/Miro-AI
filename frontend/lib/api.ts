import type { Artifact, CanvasData } from "./types";

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
): Promise<{ document_id: string; filename: string; chars: number }> {
  const form = new FormData();
  form.append("file", file);
  return check(await fetch(`${API}/documents`, { method: "POST", body: form }));
}

export async function analyzeDocument(
  documentId: string,
  intent?: string | null,
): Promise<{ canvas_id: string; title: string }> {
  return check(
    await fetch(`${API}/documents/${documentId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: intent ?? null }),
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

export async function getBoard(): Promise<BoardState> {
  return check(await fetch(`${API}/board`));
}

export async function saveBoard(state: BoardState): Promise<void> {
  await check(
    await fetch(`${API}/board`, {
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
