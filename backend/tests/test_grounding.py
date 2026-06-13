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

    assert "title" in columns
    assert "created_at" in columns
    assert row["title"] == "Default board"
    assert row["created_at"]
