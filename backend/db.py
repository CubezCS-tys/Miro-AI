"""SQLite storage. Graphs and canvas state live as JSON blobs."""

import os
import sqlite3
from pathlib import Path

DB_PATH = Path(os.environ.get("MIRO_AI_DB_PATH", Path(__file__).parent / "miro_ai.db"))
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                text TEXT NOT NULL,
                text_json TEXT,
                page_count INTEGER DEFAULT 0,
                sha256 TEXT,
                size_bytes INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                title TEXT DEFAULT 'Default board',
                state_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS canvases (
                id TEXT PRIMARY KEY,
                document_id TEXT REFERENCES documents(id),
                board_id TEXT DEFAULT 'default' REFERENCES boards(id),
                title TEXT NOT NULL,
                graph_json TEXT NOT NULL,
                layout_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS llm_cache (
                cache_key TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                task TEXT NOT NULL,
                response_json TEXT NOT NULL,
                usage_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS model_calls (
                id TEXT PRIMARY KEY,
                task TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                cache_hit INTEGER NOT NULL DEFAULT 0,
                prompt_tokens INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                estimated_cost_usd REAL DEFAULT 0,
                latency_ms INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        _ensure_columns(
            conn,
            "documents",
            {
                "text_json": "TEXT",
                "page_count": "INTEGER DEFAULT 0",
                "sha256": "TEXT",
                "size_bytes": "INTEGER DEFAULT 0",
            },
        )
        _ensure_columns(
            conn,
            "boards",
            {
                "title": "TEXT DEFAULT 'Default board'",
                "created_at": "TEXT",
            },
        )
        conn.execute(
            "UPDATE boards SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
        )
        _ensure_columns(conn, "canvases", {"board_id": "TEXT DEFAULT 'default'"})
        conn.execute(
            """INSERT INTO boards (id, title, state_json)
               VALUES ('default', 'Default board', '{"nodes":[],"edges":[]}')
               ON CONFLICT(id) DO NOTHING"""
        )


def _ensure_columns(
    conn: sqlite3.Connection, table: str, columns: dict[str, str]
) -> None:
    existing = {
        row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    for name, ddl in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
