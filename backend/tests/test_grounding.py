import importlib
import json
import sqlite3
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRO_AI_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MIRO_AI_PROVIDER", "mock")
    monkeypatch.setenv("MIRO_AI_FALLBACK_PROVIDER", "")
    monkeypatch.setenv("MIRO_AI_ENABLE_SERVER_EXECUTION", "false")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    for name in [
        "main",
        "db",
        "services.llm",
        "services.graph_extractor",
        "services.artifact_generator",
        "services.tutor",
        "services.frontier",
        "services.arena",
    ]:
        sys.modules.pop(name, None)
    return importlib.import_module("main")


def test_execute_is_disabled_by_default(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    response = client.post("/execute", json={"code": "print(1)"})

    assert response.status_code == 403
    assert "disabled" in response.json()["detail"]


def test_analyze_persists_verified_source_span(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)
    page_text = (
        "Grounded citations make the graph trustworthy and let readers verify "
        "every extracted concept from the original page."
    )
    pages = [{"page": 1, "text": page_text, "start_char": 0, "end_char": len(page_text)}]
    with main.get_db() as conn:
        conn.execute(
            """INSERT INTO documents
               (id, filename, text, text_json, page_count, sha256, size_bytes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                "doc1",
                "paper.pdf",
                f"[Page 1]\n{page_text}",
                json.dumps(pages),
                1,
                "abc123",
                123,
            ),
        )

    response = client.post("/documents/doc1/analyze", json={"intent": "test"})
    assert response.status_code == 200
    canvas_id = response.json()["canvas_id"]

    canvas = client.get(f"/canvas/{canvas_id}").json()
    node = canvas["graph"]["nodes"][0]

    assert node["source_page"] == 1
    assert node["source_span"]["page"] == 1
    assert node["source_span"]["verified"] is True
    assert node["source_span"]["quote"] in page_text

    page_response = client.get("/documents/doc1/pages/1")
    assert page_response.status_code == 200
    page = page_response.json()
    assert page["filename"] == "paper.pdf"
    assert page["text"] == page_text


def test_tutor_uses_mock_provider_without_keys(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    response = client.post(
        "/tutor",
        json={
            "selection": [
                {
                    "label": "Grounding",
                    "summary": "Claims should cite source text.",
                    "source_page": 2,
                    "source_quote": "claims should cite source text",
                }
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["questions"]
    assert body["questions"][0]["source_quote"]
    assert body["weak_links"]


def test_init_db_migrates_old_board_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "old.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE boards (
                id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE canvases (
                id TEXT PRIMARY KEY,
                document_id TEXT REFERENCES documents(id),
                title TEXT NOT NULL,
                graph_json TEXT NOT NULL,
                layout_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO boards (id, state_json) VALUES ('default', '{"nodes":[],"edges":[]}');
            """
        )
    monkeypatch.setenv("MIRO_AI_DB_PATH", str(db_path))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.modules.pop("db", None)
    db = importlib.import_module("db")

    db.init_db()

    with db.get_db() as conn:
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(boards)").fetchall()
        }
        row = conn.execute(
            "SELECT title, created_at FROM boards WHERE id = 'default'"
        ).fetchone()
        migrations = {
            item["name"]
            for item in conn.execute("SELECT name FROM schema_migrations").fetchall()
        }

    assert "title" in columns
    assert "created_at" in columns
    assert row["title"] == "Default board"
    assert row["created_at"]
    assert "20260613_board_metadata" in migrations
    assert "20260613_research_frontier_tables" in migrations


def test_frontier_mock_proposal_persists_source_claims_and_accepts(
    tmp_path, monkeypatch
):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    response = client.post(
        "/research/frontier",
        json={
            "board_id": "default",
            "query": "Photosynthesis",
            "source_types": ["mock"],
            "selection": [
                {
                    "node_id": "node-1",
                    "id": "photosynthesis",
                    "label": "Photosynthesis",
                    "summary": "Plants convert light into stored energy.",
                    "source_quote": "chlorophyll absorbs light energy",
                    "source_page": 3,
                    "kind": "process",
                }
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    proposal_id = body["proposal_id"]
    assert body["status"] == "pending"
    assert len(body["proposal"]["nodes"]) == 3
    assert {edge["kind"] for edge in body["proposal"]["edges"]} == {
        "supports",
        "contradicts",
        "context",
    }

    with main.get_db() as conn:
        source_count = conn.execute("SELECT COUNT(*) AS count FROM sources").fetchone()[
            "count"
        ]
        claim_count = conn.execute("SELECT COUNT(*) AS count FROM claims").fetchone()[
            "count"
        ]
        proposal = conn.execute(
            "SELECT status FROM graph_proposals WHERE id = ?", (proposal_id,)
        ).fetchone()

    assert source_count == 1
    assert claim_count == 3
    assert proposal["status"] == "pending"

    accept = client.post(f"/research/proposals/{proposal_id}/accept")
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"


def test_live_research_fetching_is_gated_by_default(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    response = client.post(
        "/research/frontier",
        json={
            "source_types": ["web"],
            "selection": [{"node_id": "n1", "label": "Unsupported web search"}],
        },
    )

    assert response.status_code == 403
    assert "disabled" in response.json()["detail"]


def test_tutor_arena_session_completes_and_persists_mastery(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    start = client.post(
        "/tutor/sessions",
        json={
            "board_id": "default",
            "selected_nodes": [
                {
                    "node_id": "node-1",
                    "id": "grounding",
                    "label": "Grounding",
                    "summary": "Claims should cite source text.",
                    "source_quote": "Grounded citations make the graph trustworthy",
                    "source_page": 1,
                    "kind": "concept",
                }
            ],
        },
    )
    assert start.status_code == 200
    session_id = start.json()["session_id"]
    question = start.json()["current_question"]
    assert question["source_quote"]

    answer_body = {
        "answer": (
            "Grounded citations make the graph trustworthy because the answer "
            "must begin from source text before reasoning."
        )
    }
    complete = False
    for _ in range(5):
        response = client.post(f"/tutor/sessions/{session_id}/answer", json=answer_body)
        assert response.status_code == 200
        complete = response.json()["complete"]
        if complete:
            break

    assert complete is True
    finish = client.post(f"/tutor/sessions/{session_id}/finish")
    assert finish.status_code == 200
    body = finish.json()
    assert body["flashcards"]
    assert body["presentation_path"]
    assert body["graph_revision"]["summary"]

    with main.get_db() as conn:
        mastery = conn.execute(
            "SELECT state, score FROM node_mastery WHERE board_id = ? AND node_id = ?",
            ("default", "node-1"),
        ).fetchone()

    assert mastery["state"] == "solid"
    assert mastery["score"] >= 0.9


def test_extraction_eval_fixtures_verify_expected_quotes(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    fixture_path = Path(__file__).parent / "fixtures" / "extraction_eval.json"
    cases = json.loads(fixture_path.read_text())

    for case in cases:
        text = "\n\n".join(page["text"] for page in case["pages"])
        graph = main.extract_graph(text, pages=case["pages"], document_hash=case["name"])
        node = graph.nodes[0]

        assert node.source_page == case["expected_page"]
        assert node.source_span
        assert node.source_span.verified is True
        assert case["expected_quote_contains"] in node.source_quote
