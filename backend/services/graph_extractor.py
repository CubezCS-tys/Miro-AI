"""Core extraction pipeline: document text -> knowledge graph.

This is the product. Runnable standalone for prompt iteration:

    python -m services.graph_extractor path/to/text_or_pdf
"""

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel

from services.llm import QUALITY_MODEL, generate_json, make_cache_key

# backend/.env - loaded here so both the API server and standalone runs get it
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MODEL = QUALITY_MODEL
MAX_DOC_CHARS = 400_000


class SourceSpan(BaseModel):
    page: int
    start_char: int | None = None
    end_char: int | None = None
    quote: str
    verified: bool = False


class Node(BaseModel):
    id: str
    label: str
    summary: str
    source_quote: str
    source_page: int | None = None
    source_span: SourceSpan | None = None
    kind: str


class Edge(BaseModel):
    source: str
    target: str
    label: str


class KnowledgeGraph(BaseModel):
    title: str
    nodes: list[Node]
    edges: list[Edge]


GRAPH_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {
            "type": "string",
            "description": "Short title for the document's central topic",
        },
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "label": {
                        "type": "string",
                        "description": "Concept name, 2-4 words",
                    },
                    "summary": {
                        "type": "string",
                        "description": "1-2 sentence explanation for a reader new to the topic",
                    },
                    "source_quote": {
                        "type": "string",
                        "description": "Verbatim quote from the document that grounds this concept",
                    },
                    "source_page": {
                        "type": "integer",
                        "description": "1-indexed page number where source_quote appears",
                    },
                    "source_span": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "page": {"type": "integer"},
                            "start_char": {
                                "type": "integer",
                                "description": "Character offset inside that page text",
                            },
                            "end_char": {
                                "type": "integer",
                                "description": "Character offset after the quote inside that page text",
                            },
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"},
                        },
                        "required": [
                            "page",
                            "start_char",
                            "end_char",
                            "quote",
                            "verified",
                        ],
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["concept", "process", "entity", "formula"],
                    },
                },
                "required": [
                    "id",
                    "label",
                    "summary",
                    "source_quote",
                    "source_page",
                    "source_span",
                    "kind",
                ],
            },
        },
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "source": {"type": "string"},
                    "target": {"type": "string"},
                    "label": {
                        "type": "string",
                        "description": "Specific relationship: 'depends on', 'is a type of', 'causes', ...",
                    },
                },
                "required": ["source", "target", "label"],
            },
        },
    },
    "required": ["title", "nodes", "edges"],
}

EXTRACTION_PROMPT = """\
Extract a knowledge graph from this document for a reader trying to deeply \
understand it.
{goal}
- 10-30 nodes: the concepts someone must understand, not section headings.
- Edge labels must express *why* concepts relate ("depends on", "generalizes", \
"causes", "is computed from") - never just "related to".
- source_quote must be verbatim text from a numbered page. Never invent quotes.
- source_page must be the 1-indexed page where source_quote appears.
- source_span should identify the quote location on that page when you can.
- Prefer a connected graph: every node reachable from the central concept \
where the document supports it.
- Node ids: short kebab-case slugs referenced by edges.

<document pages="numbered">
{document}
</document>"""


def extract_graph(
    document_text: str,
    intent: str | None = None,
    pages: list[dict[str, Any]] | None = None,
    document_hash: str | None = None,
) -> KnowledgeGraph:
    goal = ""
    if intent and intent.strip():
        goal = (
            f"\nThe reader's specific goal: {intent.strip()}\n"
            "Shape the graph around this goal — choose, name, and connect nodes "
            "to serve it. Leave out material irrelevant to the goal.\n"
        )
    page_list = pages or _single_page(document_text)
    prompt = EXTRACTION_PROMPT.format(
        document=_page_prompt(page_list),
        goal=goal,
    )
    cache_key = make_cache_key(
        "extract_graph",
        os.environ.get("MIRO_AI_PROVIDER", "gemini"),
        MODEL,
        f"{document_hash or prompt}:{intent or ''}",
        GRAPH_SCHEMA,
    )
    result = generate_json(
        task="extract_graph",
        prompt=prompt,
        schema=GRAPH_SCHEMA,
        model_role="quality",
        cache_key=cache_key,
    )
    graph = KnowledgeGraph.model_validate(result.parsed)
    return _drop_dangling_edges(_verify_sources(graph, page_list))


def _drop_dangling_edges(graph: KnowledgeGraph) -> KnowledgeGraph:
    node_ids = {n.id for n in graph.nodes}
    graph.edges = [
        e for e in graph.edges if e.source in node_ids and e.target in node_ids
    ]
    return graph


def _verify_sources(
    graph: KnowledgeGraph, pages: list[dict[str, Any]]
) -> KnowledgeGraph:
    by_page = {int(page["page"]): str(page["text"]) for page in pages}
    for node in graph.nodes:
        match = _find_quote(node.source_quote, node.source_page, by_page)
        if match:
            page, start, end = match
            node.source_page = page
            node.source_span = SourceSpan(
                page=page,
                start_char=start,
                end_char=end,
                quote=node.source_quote,
                verified=True,
            )
        else:
            page = node.source_page or (node.source_span.page if node.source_span else 1)
            node.source_span = SourceSpan(
                page=page,
                start_char=None,
                end_char=None,
                quote=node.source_quote,
                verified=False,
            )
    return graph


def _find_quote(
    quote: str, source_page: int | None, by_page: dict[int, str]
) -> tuple[int, int, int] | None:
    quote = quote.strip()
    if not quote:
        return None
    page_order = [source_page] if source_page in by_page else []
    page_order.extend(page for page in by_page if page not in page_order)
    for page in page_order:
        text = by_page[page]
        start = text.find(quote)
        if start >= 0:
            return page, start, start + len(quote)
    return None


def _single_page(document_text: str) -> list[dict[str, Any]]:
    return [{"page": 1, "text": document_text[:MAX_DOC_CHARS]}]


def _page_prompt(pages: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    used = 0
    for page in pages:
        text = str(page["text"]).strip()
        if not text:
            continue
        remaining = MAX_DOC_CHARS - used
        if remaining <= 0:
            break
        clipped = text[:remaining]
        chunks.append(f'<page number="{int(page["page"])}">\n{clipped}\n</page>')
        used += len(clipped)
    return "\n\n".join(chunks)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m services.graph_extractor <file.txt|file.pdf>")
    path = sys.argv[1]
    if path.lower().endswith(".pdf"):
        from services.pdf_parser import extract_document

        extracted = extract_document(path)
        text = extracted.text
        pages = [page.__dict__ for page in extracted.pages]
    else:
        with open(path) as f:
            text = f.read()
        pages = None
    result = extract_graph(text, pages=pages)
    print(result.model_dump_json(indent=2))
    print(
        f"\n-- {len(result.nodes)} nodes, {len(result.edges)} edges --",
        file=sys.stderr,
    )
