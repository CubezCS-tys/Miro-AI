# Miro-AI

Upload a document → get an interactive knowledge graph of its ideas.

## Architecture

```
frontend/   Next.js 16 + React Flow + ELK   (port 3000)
backend/    FastAPI + Claude API + SQLite   (port 8000)
```

The core loop: `POST /documents` parses the PDF (PyMuPDF), `POST
/documents/{id}/analyze` sends the full text to Claude (`claude-opus-4-8`,
structured output) and stores the extracted graph, `GET /canvas/{id}` serves
it to the React Flow canvas. Node positions the user drags are persisted via
`PUT /canvas/{id}/layout`.

## Running it

**Backend** (needs an Anthropic API key):

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
# put your API key in backend/.env (ANTHROPIC_API_KEY=sk-ant-...)
.venv/bin/uvicorn main:app --reload --port 8000
```

**Frontend** (needs Node ≥ 20 — `nvm use` picks it up from `.nvmrc`):

```bash
cd frontend
nvm use
npm install        # first time
npm run dev
```

Open http://localhost:3000, drop in a PDF.

## Iterating on extraction quality (the part that matters)

The extractor runs standalone — no server or frontend needed:

```bash
cd backend
.venv/bin/python -m services.graph_extractor path/to/paper.pdf
```

The key is read from `backend/.env` automatically.

Prints the graph JSON. Edit `EXTRACTION_PROMPT` in
`services/graph_extractor.py` and re-run. This loop is where the product
gets good.

## Deliberately out of scope (MVP)

Auth, collaboration, handwriting OCR, generative AI nodes, Arabic/RTL,
export, manual graph editing.
