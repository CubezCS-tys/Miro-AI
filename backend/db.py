"""SQLite storage. Graphs and canvas state live as JSON blobs."""

import os
import sqlite3
from collections.abc import Callable
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
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name TEXT PRIMARY KEY,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
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
            CREATE TABLE IF NOT EXISTS sources (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT,
                local_path TEXT,
                sha256 TEXT,
                content_text TEXT,
                metadata_json TEXT,
                fetched_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS claims (
                id TEXT PRIMARY KEY,
                source_id TEXT REFERENCES sources(id),
                text TEXT NOT NULL,
                quote TEXT NOT NULL,
                page INTEGER,
                start_char INTEGER,
                end_char INTEGER,
                url_anchor TEXT,
                stance TEXT DEFAULT 'context',
                confidence REAL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS graph_proposals (
                id TEXT PRIMARY KEY,
                board_id TEXT DEFAULT 'default' REFERENCES boards(id),
                source_node_ids_json TEXT NOT NULL,
                proposal_json TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tutor_sessions (
                id TEXT PRIMARY KEY,
                board_id TEXT DEFAULT 'default' REFERENCES boards(id),
                selected_node_ids_json TEXT NOT NULL,
                selected_nodes_json TEXT NOT NULL,
                mode TEXT DEFAULT 'socratic',
                mastery_json TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tutor_turns (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES tutor_sessions(id),
                question_json TEXT NOT NULL,
                answer_text TEXT,
                evaluation_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS node_mastery (
                board_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                state TEXT NOT NULL,
                score REAL DEFAULT 0,
                last_seen_at TEXT,
                due_at TEXT,
                PRIMARY KEY (board_id, node_id)
            );
            """
        )
        _run_migration(conn, "20260613_document_page_metadata", _migrate_documents)
        _run_migration(conn, "20260613_board_metadata", _migrate_boards)
        _run_migration(conn, "20260613_canvas_board_id", _migrate_canvases)
        _run_migration(
            conn, "20260613_research_frontier_tables", _migrate_research_tables
        )
        _run_migration(
            conn, "20260613_tutor_arena_tables", _migrate_tutor_tables
        )
        conn.execute(
            """INSERT INTO boards (id, title, state_json)
               VALUES ('default', 'Default board', '{"nodes":[],"edges":[]}')
               ON CONFLICT(id) DO NOTHING"""
        )


def _run_migration(
    conn: sqlite3.Connection,
    name: str,
    migration: Callable[[sqlite3.Connection], None],
) -> None:
    row = conn.execute(
        "SELECT name FROM schema_migrations WHERE name = ?", (name,)
    ).fetchone()
    if row:
        return
    migration(conn)
    conn.execute("INSERT INTO schema_migrations (name) VALUES (?)", (name,))


def _migrate_documents(conn: sqlite3.Connection) -> None:
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


def _migrate_boards(conn: sqlite3.Connection) -> None:
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
    conn.execute(
        "UPDATE boards SET title = 'Default board' WHERE title IS NULL OR title = ''"
    )


def _migrate_canvases(conn: sqlite3.Connection) -> None:
    _ensure_columns(conn, "canvases", {"board_id": "TEXT DEFAULT 'default'"})


def _migrate_research_tables(conn: sqlite3.Connection) -> None:
    _ensure_columns(
        conn,
        "sources",
        {
            "content_text": "TEXT",
            "metadata_json": "TEXT",
            "fetched_at": "TEXT",
        },
    )
    _ensure_columns(
        conn,
        "claims",
        {
            "url_anchor": "TEXT",
            "stance": "TEXT DEFAULT 'context'",
            "confidence": "REAL DEFAULT 0",
        },
    )
    _ensure_columns(
        conn,
        "graph_proposals",
        {
            "status": "TEXT DEFAULT 'pending'",
            "updated_at": "TEXT",
        },
    )


def _migrate_tutor_tables(conn: sqlite3.Connection) -> None:
    _ensure_columns(
        conn,
        "tutor_sessions",
        {
            "mode": "TEXT DEFAULT 'socratic'",
            "status": "TEXT DEFAULT 'active'",
            "updated_at": "TEXT",
        },
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
