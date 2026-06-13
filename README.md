# Miro-AI

Miro-AI turns PDFs into grounded visual knowledge graphs. The product bet is simple: a whiteboard is only useful for serious thinking if every AI-generated claim can point back to the source page that justified it.

## What exists

- PDF upload and page-aware text extraction.
- Graph extraction with source quotes, page numbers, and verified quote spans.
- React Flow canvas with document, concept, text, sticky, shape, code, table, chart, and note nodes.
- Manual graph editing through concept nodes, editable node panels, draggable layout, edge creation, and edge labels.
- AI artifact generation for tables, charts, and notes using selected graph/document context.
- Browser-first Python code nodes through Pyodide.
- Backend Python execution gated off by default behind `MIRO_AI_ENABLE_SERVER_EXECUTION=true`.
- Multi-board storage and a document library API.
- Command palette foundation for cluster summaries, Socratic tutor mode, lens modes, linked chart creation, and selected graph export.
- Presentation mode at `/present` for selected grounded graph regions.
- Mocked backend and frontend smoke tests plus CI.

## Architecture

```text
frontend/   Next.js 16 + React Flow + ELK + Playwright
backend/    FastAPI + Gemini/Anthropic adapter + SQLite + PyMuPDF
```

Core flow:

1. `POST /documents` stores a PDF locally, extracts page text, hashes the upload, and stores page metadata.
2. `POST /documents/{id}/analyze` sends bounded page text to the configured LLM provider and asks for structured graph JSON.
3. The backend verifies each node quote against extracted page text and stores the grounded graph on a canvas.
4. The frontend renders concept nodes with page chips and opens a panel with quote location and verification state.

## Privacy and security boundaries

- Uploaded PDFs are stored by the local backend.
- Document text is sent to the configured AI provider only when analysis or generation is requested.
- Server-side Python execution is disabled by default. Browser Python remains available.
- Secrets live in `backend/.env`; never commit it.
- Local LLM responses are cached in SQLite by task/model/schema/content hash to reduce repeat cost.

## Backend

```bash
cd backend
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn main:app --reload --port 8000
```

Set at least one provider key in `backend/.env`:

```bash
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Default model config:

```bash
MIRO_AI_PROVIDER=gemini
MIRO_AI_FALLBACK_PROVIDER=anthropic
MIRO_AI_EXTRACTION_MODEL=gemini-3.1-pro-preview
MIRO_AI_LIGHT_MODEL=gemini-3.1-flash-lite
MIRO_AI_ENABLE_SERVER_EXECUTION=false
```

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000.

## Tests

```bash
PYTHONPATH=backend backend/.venv/bin/python -m pytest -q backend/tests

cd frontend
npm run lint
npm run build
npm run test:smoke
```

The tests use mocked provider responses and do not require real Gemini or Anthropic keys.

## Useful API endpoints

- `GET /config`
- `POST /documents`
- `GET /documents`
- `POST /documents/{id}/analyze`
- `GET /canvas/{id}`
- `GET /boards`
- `POST /boards`
- `GET /boards/{id}`
- `PUT /boards/{id}`
- `POST /generate`
- `POST /tutor`
- `POST /execute`, disabled unless explicitly enabled
