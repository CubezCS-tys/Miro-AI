"""SQLite storage. Graphs and canvas state live as JSON blobs — no ORM needed yet."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "miro_ai.db"
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
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS canvases (
                id TEXT PRIMARY KEY,
                document_id TEXT REFERENCES documents(id),
                title TEXT NOT NULL,
                graph_json TEXT NOT NULL,      -- extraction output (source of truth)
                layout_json TEXT,              -- user-owned node positions
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
