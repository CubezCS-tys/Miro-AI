import hashlib
import json
import os
import subprocess
import sys
import time
import uuid

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import UPLOAD_DIR, get_db, init_db
from services.artifact_generator import generate_artifacts
from services.graph_extractor import extract_graph
from services.llm import LIGHT_MODEL, PROVIDER, QUALITY_MODEL
from services.pdf_parser import extract_document
from services.tutor import generate_tutor


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


MAX_UPLOAD_BYTES = int(os.environ.get("MIRO_AI_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
MAX_PROMPT_CHARS = int(os.environ.get("MIRO_AI_MAX_PROMPT_CHARS", "12000"))
MAX_CODE_CHARS = int(os.environ.get("MIRO_AI_MAX_CODE_CHARS", "20000"))
SERVER_EXECUTION_ENABLED = env_bool("MIRO_AI_ENABLE_SERVER_EXECUTION", False)

app = FastAPI(title="Miro-AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


@app.get("/config")
async def get_config():
    return {
        "server_execution_enabled": SERVER_EXECUTION_ENABLED,
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "max_prompt_chars": MAX_PROMPT_CHARS,
        "max_code_chars": MAX_CODE_CHARS,
        "provider": PROVIDER,
        "quality_model": QUALITY_MODEL,
        "light_model": LIGHT_MODEL,
        "privacy_boundary": (
            "Uploaded PDFs are stored by this local backend and sent to the "
            "configured AI provider only when you request AI analysis."
        ),
    }


@app.post("/documents")
async def upload_document(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"PDF is too large. Limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    doc_id = uuid.uuid4().hex
    pdf_path = UPLOAD_DIR / f"{doc_id}.pdf"
    pdf_path.write_bytes(content)
    sha256 = hashlib.sha256(content).hexdigest()

    try:
        extracted = await run_in_threadpool(extract_document, str(pdf_path))
    except ValueError as e:
        raise HTTPException(422, str(e))
    pages_json = json.dumps([page.__dict__ for page in extracted.pages])

    with get_db() as conn:
        conn.execute(
            """INSERT INTO documents
               (id, filename, text, text_json, page_count, sha256, size_bytes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                doc_id,
                file.filename,
                extracted.text,
                pages_json,
                len(extracted.pages),
                sha256,
                len(content),
            ),
        )
    return {
        "document_id": doc_id,
        "filename": file.filename,
        "chars": len(extracted.text),
        "page_count": len(extracted.pages),
    }


@app.get("/documents")
async def list_documents():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, filename, page_count, size_bytes, created_at
               FROM documents
               ORDER BY created_at DESC"""
        ).fetchall()
    return {"documents": [dict(row) for row in rows]}


class AnalyzeRequest(BaseModel):
    intent: str | None = None
    board_id: str = "default"


@app.post("/documents/{doc_id}/analyze")
async def analyze_document(doc_id: str, body: AnalyzeRequest | None = None):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")

    intent = body.intent if body else None
    board_id = body.board_id if body else "default"
    pages = json.loads(row["text_json"]) if row["text_json"] else None
    try:
        graph = await run_in_threadpool(
            extract_graph, row["text"], intent, pages, row["sha256"]
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    canvas_id = uuid.uuid4().hex
    with get_db() as conn:
        conn.execute(
            """INSERT INTO canvases
               (id, document_id, board_id, title, graph_json)
               VALUES (?, ?, ?, ?, ?)""",
            (canvas_id, doc_id, board_id, graph.title, graph.model_dump_json()),
        )
    return {"canvas_id": canvas_id, "title": graph.title, "board_id": board_id}


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
    code: str = Field(max_length=MAX_CODE_CHARS)


MAX_OUTPUT = 20_000


@app.post("/execute")
async def execute_code(body: ExecuteRequest):
    if not SERVER_EXECUTION_ENABLED:
        raise HTTPException(
            403,
            "Server Python execution is disabled. Use browser Python or set MIRO_AI_ENABLE_SERVER_EXECUTION=true locally.",
        )

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
    prompt: str = Field(max_length=MAX_PROMPT_CHARS)
    document_ids: list[str] = Field(default_factory=list)
    selection: list[dict] = Field(default_factory=list)


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


class TutorRequest(BaseModel):
    selection: list[dict] = Field(default_factory=list, max_length=40)
    focus: str | None = Field(default=None, max_length=1000)


@app.post("/tutor")
async def tutor(body: TutorRequest):
    if not body.selection:
        raise HTTPException(400, "Select at least one grounded node first")
    try:
        result = await run_in_threadpool(generate_tutor, body.selection, body.focus)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return result.model_dump()


@app.get("/board")
async def get_default_board():
    return await get_board("default")


@app.get("/boards")
async def list_boards():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, title, created_at, updated_at
               FROM boards
               ORDER BY updated_at DESC"""
        ).fetchall()
    return {"boards": [dict(row) for row in rows]}


class CreateBoardRequest(BaseModel):
    title: str = Field(default="Untitled board", max_length=80)


@app.post("/boards")
async def create_board(body: CreateBoardRequest):
    board_id = uuid.uuid4().hex
    with get_db() as conn:
        conn.execute(
            """INSERT INTO boards (id, title, state_json, created_at, updated_at)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
            (board_id, body.title.strip() or "Untitled board", '{"nodes":[],"edges":[]}'),
        )
        row = conn.execute(
            "SELECT id, title, created_at, updated_at FROM boards WHERE id = ?",
            (board_id,),
        ).fetchone()
    return dict(row)


@app.get("/boards/{board_id}")
async def get_board(board_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT state_json FROM boards WHERE id = ?", (board_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Board not found")
    return json.loads(row["state_json"])


class BoardState(BaseModel):
    nodes: list[dict]
    edges: list[dict]


@app.put("/board")
async def save_default_board(state: BoardState):
    return await save_board("default", state)


@app.put("/boards/{board_id}")
async def save_board(board_id: str, state: BoardState):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO boards (id, title, state_json, created_at, updated_at)
               VALUES (?, 'Untitled board', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT(id) DO UPDATE
               SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP""",
            (board_id, state.model_dump_json()),
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
