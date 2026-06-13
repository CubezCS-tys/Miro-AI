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
from services.arena import evaluate_answer, finish_session, initial_mastery, question_for
from services.artifact_generator import generate_artifacts
from services.frontier import build_mock_frontier
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
LIVE_RESEARCH_ENABLED = env_bool("MIRO_AI_ENABLE_LIVE_RESEARCH", False)

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
        "live_research_enabled": LIVE_RESEARCH_ENABLED,
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


@app.get("/documents/{doc_id}/pages/{page_number}")
async def get_document_page(doc_id: str, page_number: int):
    if page_number < 1:
        raise HTTPException(400, "Page number must be at least 1")
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, filename, text_json, page_count FROM documents WHERE id = ?",
            (doc_id,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")
    pages = json.loads(row["text_json"]) if row["text_json"] else []
    page = next((item for item in pages if int(item["page"]) == page_number), None)
    if not page:
        raise HTTPException(404, "Page not found")
    return {
        "document_id": row["id"],
        "filename": row["filename"],
        "page": int(page["page"]),
        "page_count": row["page_count"],
        "text": page["text"],
        "start_char": page.get("start_char"),
        "end_char": page.get("end_char"),
    }


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
        "document_id": row["document_id"],
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


class FrontierRequest(BaseModel):
    board_id: str = "default"
    query: str | None = Field(default=None, max_length=1000)
    selection: list[dict] = Field(default_factory=list, max_length=40)
    source_types: list[str] = Field(default_factory=lambda: ["mock"])
    budget: str = Field(default="cheap", max_length=32)


@app.post("/research/frontier")
async def create_frontier(body: FrontierRequest):
    if not body.selection:
        raise HTTPException(400, "Select at least one grounded node first")
    if any(source_type != "mock" for source_type in body.source_types):
        if not LIVE_RESEARCH_ENABLED:
            raise HTTPException(403, "Live research fetching is disabled")
        raise HTTPException(501, "Live research fetching is not implemented yet")
    try:
        proposal = build_mock_frontier(
            board_id=body.board_id,
            query=body.query,
            selection=body.selection,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    proposal_id = uuid.uuid4().hex
    source_node_ids = [
        str(node.get("node_id") or node.get("id") or node.get("label"))
        for node in body.selection
    ]
    with get_db() as conn:
        for source in proposal["sources"]:
            conn.execute(
                """INSERT INTO sources
                   (id, kind, title, url, local_path, sha256, content_text, metadata_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO NOTHING""",
                (
                    source["id"],
                    source["kind"],
                    source["title"],
                    source["url"],
                    source["local_path"],
                    source["sha256"],
                    source["content_text"],
                    json.dumps(source.get("metadata") or {}),
                ),
            )
        for claim in proposal["claims"]:
            conn.execute(
                """INSERT INTO claims
                   (id, source_id, text, quote, page, start_char, end_char,
                    url_anchor, stance, confidence)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO NOTHING""",
                (
                    claim["id"],
                    claim["source_id"],
                    claim["text"],
                    claim["quote"],
                    claim["page"],
                    claim["start_char"],
                    claim["end_char"],
                    claim["url_anchor"],
                    claim["stance"],
                    claim["confidence"],
                ),
            )
        conn.execute(
            """INSERT INTO graph_proposals
               (id, board_id, source_node_ids_json, proposal_json, status)
               VALUES (?, ?, ?, ?, 'pending')""",
            (
                proposal_id,
                body.board_id,
                json.dumps(source_node_ids),
                json.dumps(proposal),
            ),
        )
    return {"proposal_id": proposal_id, "status": "pending", "proposal": proposal}


@app.post("/research/proposals/{proposal_id}/accept")
async def accept_frontier_proposal(proposal_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT proposal_json, status FROM graph_proposals WHERE id = ?",
            (proposal_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Proposal not found")
        conn.execute(
            """UPDATE graph_proposals
               SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (proposal_id,),
        )
    return {
        "proposal_id": proposal_id,
        "status": "accepted",
        "proposal": json.loads(row["proposal_json"]),
    }


@app.post("/research/proposals/{proposal_id}/reject")
async def reject_frontier_proposal(proposal_id: str):
    with get_db() as conn:
        cur = conn.execute(
            """UPDATE graph_proposals
               SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (proposal_id,),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "Proposal not found")
    return {"proposal_id": proposal_id, "status": "rejected"}


class TutorSessionRequest(BaseModel):
    board_id: str = "default"
    selected_nodes: list[dict] = Field(default_factory=list, min_length=1, max_length=40)
    mode: str = Field(default="socratic", max_length=40)


@app.post("/tutor/sessions")
async def create_tutor_session(body: TutorSessionRequest):
    session_id = uuid.uuid4().hex
    node_ids = [
        str(node.get("node_id") or node.get("id") or node.get("label"))
        for node in body.selected_nodes
    ]
    mastery = initial_mastery(body.selected_nodes)
    question = question_for(body.selected_nodes, 0)
    with get_db() as conn:
        conn.execute(
            """INSERT INTO tutor_sessions
               (id, board_id, selected_node_ids_json, selected_nodes_json, mode, mastery_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                body.board_id,
                json.dumps(node_ids),
                json.dumps(body.selected_nodes),
                body.mode,
                json.dumps(mastery),
            ),
        )
        if question:
            conn.execute(
                """INSERT INTO tutor_turns (id, session_id, question_json)
                   VALUES (?, ?, ?)""",
                (uuid.uuid4().hex, session_id, json.dumps(question)),
            )
    return {
        "session_id": session_id,
        "status": "active",
        "mode": body.mode,
        "mastery": mastery,
        "current_question": question,
        "selected_nodes": body.selected_nodes,
    }


class TutorAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)


@app.post("/tutor/sessions/{session_id}/answer")
async def answer_tutor_question(session_id: str, body: TutorAnswerRequest):
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM tutor_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session:
            raise HTTPException(404, "Tutor session not found")
        turn = conn.execute(
            """SELECT * FROM tutor_turns
               WHERE session_id = ? AND answer_text IS NULL
               ORDER BY created_at DESC LIMIT 1""",
            (session_id,),
        ).fetchone()
        if not turn:
            raise HTTPException(409, "No active question")
        selection = json.loads(session["selected_nodes_json"])
        mastery = json.loads(session["mastery_json"])
        question = json.loads(turn["question_json"])
        evaluation = evaluate_answer(body.answer, question, mastery)
        answered_count = conn.execute(
            "SELECT COUNT(*) AS count FROM tutor_turns WHERE session_id = ?",
            (session_id,),
        ).fetchone()["count"]
        next_question = question_for(selection, int(answered_count))
        conn.execute(
            """UPDATE tutor_turns
               SET answer_text = ?, evaluation_json = ?
               WHERE id = ?""",
            (body.answer, json.dumps(evaluation), turn["id"]),
        )
        if next_question:
            conn.execute(
                """INSERT INTO tutor_turns (id, session_id, question_json)
                   VALUES (?, ?, ?)""",
                (uuid.uuid4().hex, session_id, json.dumps(next_question)),
            )
        else:
            conn.execute(
                """UPDATE tutor_sessions
                   SET status = 'ready_to_finish', updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (session_id,),
            )
        conn.execute(
            """UPDATE tutor_sessions
               SET mastery_json = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (json.dumps(mastery), session_id),
        )
        for node_id, item in mastery.items():
            conn.execute(
                """INSERT INTO node_mastery
                   (board_id, node_id, state, score, last_seen_at)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(board_id, node_id) DO UPDATE
                   SET state = excluded.state,
                       score = excluded.score,
                       last_seen_at = CURRENT_TIMESTAMP""",
                (
                    session["board_id"],
                    node_id,
                    item["state"],
                    item["score"],
                ),
            )
    return {
        "session_id": session_id,
        "evaluation": evaluation,
        "mastery": mastery,
        "next_question": next_question,
        "complete": next_question is None,
    }


@app.get("/tutor/sessions/{session_id}")
async def get_tutor_session(session_id: str):
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM tutor_sessions WHERE id = ?", (session_id,)
        ).fetchone()
    if not session:
        raise HTTPException(404, "Tutor session not found")
    return {
        "session_id": session["id"],
        "board_id": session["board_id"],
        "status": session["status"],
        "mode": session["mode"],
        "mastery": json.loads(session["mastery_json"]),
        "selected_nodes": json.loads(session["selected_nodes_json"]),
    }


@app.post("/tutor/sessions/{session_id}/finish")
async def finish_tutor_session(session_id: str):
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM tutor_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session:
            raise HTTPException(404, "Tutor session not found")
        selection = json.loads(session["selected_nodes_json"])
        mastery = json.loads(session["mastery_json"])
        result = finish_session(selection, mastery)
        conn.execute(
            """UPDATE tutor_sessions
               SET status = 'complete', updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (session_id,),
        )
    return {"session_id": session_id, **result}


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
