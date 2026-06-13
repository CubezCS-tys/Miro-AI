import json
import subprocess
import sys
import time
import uuid

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import UPLOAD_DIR, get_db, init_db
from services.artifact_generator import generate_artifacts
from services.graph_extractor import extract_graph
from services.pdf_parser import extract_text

app = FastAPI(title="Miro-AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


@app.post("/documents")
async def upload_document(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    doc_id = uuid.uuid4().hex
    pdf_path = UPLOAD_DIR / f"{doc_id}.pdf"
    pdf_path.write_bytes(await file.read())

    try:
        text = await run_in_threadpool(extract_text, str(pdf_path))
    except ValueError as e:
        raise HTTPException(422, str(e))

    with get_db() as conn:
        conn.execute(
            "INSERT INTO documents (id, filename, text) VALUES (?, ?, ?)",
            (doc_id, file.filename, text),
        )
    return {"document_id": doc_id, "filename": file.filename, "chars": len(text)}


class AnalyzeRequest(BaseModel):
    intent: str | None = None


@app.post("/documents/{doc_id}/analyze")
async def analyze_document(doc_id: str, body: AnalyzeRequest | None = None):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")

    intent = body.intent if body else None
    try:
        graph = await run_in_threadpool(extract_graph, row["text"], intent)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    canvas_id = uuid.uuid4().hex
    with get_db() as conn:
        conn.execute(
            "INSERT INTO canvases (id, document_id, title, graph_json) VALUES (?, ?, ?, ?)",
            (canvas_id, doc_id, graph.title, graph.model_dump_json()),
        )
    return {"canvas_id": canvas_id, "title": graph.title}


@app.get("/canvas/{canvas_id}")
async def get_canvas(canvas_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM canvases WHERE id = ?", (canvas_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Canvas not found")
    return {
        "id": row["id"],
        "title": row["title"],
        "graph": json.loads(row["graph_json"]),
        "layout": json.loads(row["layout_json"]) if row["layout_json"] else None,
    }


class ExecuteRequest(BaseModel):
    code: str


MAX_OUTPUT = 20_000


@app.post("/execute")
async def execute_code(body: ExecuteRequest):
    # Local single-user tool: code runs with the user's own privileges, like
    # Jupyter. Must be sandboxed before this ever serves multiple users.
    def run():
        start = time.monotonic()
        try:
            proc = subprocess.run(
                [sys.executable, "-c", body.code],
                capture_output=True,
                text=True,
                timeout=30,
                cwd="/tmp",
            )
            return {
                "stdout": proc.stdout[-MAX_OUTPUT:],
                "stderr": proc.stderr[-MAX_OUTPUT:],
                "exit_code": proc.returncode,
                "duration_ms": int((time.monotonic() - start) * 1000),
                "timed_out": False,
            }
        except subprocess.TimeoutExpired as e:
            return {
                "stdout": (e.stdout or "")[-MAX_OUTPUT:] if e.stdout else "",
                "stderr": "Execution timed out after 30s",
                "exit_code": -1,
                "duration_ms": 30_000,
                "timed_out": True,
            }

    return await run_in_threadpool(run)


class GenerateRequest(BaseModel):
    prompt: str
    document_ids: list[str] = []
    selection: list[dict] = []


@app.post("/generate")
async def generate(body: GenerateRequest):
    parts = []
    for doc_id in body.document_ids[:5]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT filename, text FROM documents WHERE id = ?", (doc_id,)
            ).fetchone()
        if row:
            parts.append(
                f'<document name="{row["filename"]}">\n{row["text"][:80_000]}\n</document>'
            )
    if body.selection:
        lines = "\n".join(
            f"- {s.get('label', '')}: {s.get('summary', '')}" for s in body.selection
        )
        parts.append(
            f"<selected_nodes>\nThe user has these nodes selected on the board:\n{lines}\n</selected_nodes>"
        )

    try:
        artifacts = await run_in_threadpool(
            generate_artifacts, body.prompt, "\n\n".join(parts)
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return {"artifacts": [a.model_dump() for a in artifacts]}


@app.get("/board")
async def get_board():
    with get_db() as conn:
        row = conn.execute(
            "SELECT state_json FROM boards WHERE id = 'default'"
        ).fetchone()
    return json.loads(row["state_json"]) if row else {"nodes": [], "edges": []}


class BoardState(BaseModel):
    nodes: list[dict]
    edges: list[dict]


@app.put("/board")
async def save_board(state: BoardState):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO boards (id, state_json, updated_at)
               VALUES ('default', ?, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE
               SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP""",
            (state.model_dump_json(),),
        )
    return {"ok": True}


class LayoutUpdate(BaseModel):
    layout: dict


@app.put("/canvas/{canvas_id}/layout")
async def save_layout(canvas_id: str, body: LayoutUpdate):
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE canvases SET layout_json = ? WHERE id = ?",
            (json.dumps(body.layout), canvas_id),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "Canvas not found")
    return {"ok": True}
