"""Core extraction pipeline: document text -> knowledge graph.

This is the product. Runnable standalone for prompt iteration:

    python -m services.graph_extractor path/to/text_or_pdf
"""

import json
import os
import sys
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel

# backend/.env — loaded here so both the API server and standalone runs get it
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MODEL = os.environ.get("MIRO_AI_MODEL", "claude-opus-4-8")

# Truncation guard only — Opus 4.8 has a 1M-token context, so whole
# documents go in one call. ~400K chars ≈ 100K tokens.
MAX_DOC_CHARS = 400_000


class Node(BaseModel):
    id: str
    label: str
    summary: str
    source_quote: str
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
                    "kind": {
                        "type": "string",
                        "enum": ["concept", "process", "entity", "formula"],
                    },
                },
                "required": ["id", "label", "summary", "source_quote", "kind"],
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
"causes", "is computed from") — never just "related to".
- source_quote must be verbatim text from the document. Never invent quotes.
- Prefer a connected graph: every node reachable from the central concept \
where the document supports it.
- Node ids: short kebab-case slugs referenced by edges.

<document>
{document}
</document>"""

client = anthropic.Anthropic()


def extract_graph(document_text: str, intent: str | None = None) -> KnowledgeGraph:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set — export it before starting the backend"
        )
    goal = ""
    if intent and intent.strip():
        goal = (
            f"\nThe reader's specific goal: {intent.strip()}\n"
            "Shape the graph around this goal — choose, name, and connect nodes "
            "to serve it. Leave out material irrelevant to the goal.\n"
        )
    with client.messages.stream(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"format": {"type": "json_schema", "schema": GRAPH_SCHEMA}},
        messages=[
            {
                "role": "user",
                "content": EXTRACTION_PROMPT.format(
                    document=document_text[:MAX_DOC_CHARS], goal=goal
                ),
            }
        ],
    ) as stream:
        message = stream.get_final_message()

    if message.stop_reason == "refusal":
        raise RuntimeError("Model declined to process this document")

    graph = KnowledgeGraph.model_validate_json(message.content[-1].text)
    return _drop_dangling_edges(graph)


def _drop_dangling_edges(graph: KnowledgeGraph) -> KnowledgeGraph:
    node_ids = {n.id for n in graph.nodes}
    graph.edges = [
        e for e in graph.edges if e.source in node_ids and e.target in node_ids
    ]
    return graph


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m services.graph_extractor <file.txt|file.pdf>")
    path = sys.argv[1]
    if path.lower().endswith(".pdf"):
        from services.pdf_parser import extract_text

        text = extract_text(path)
    else:
        with open(path) as f:
            text = f.read()
    result = extract_graph(text)
    print(json.dumps(result.model_dump(), indent=2, ensure_ascii=False))
    print(
        f"\n-- {len(result.nodes)} nodes, {len(result.edges)} edges --",
        file=sys.stderr,
    )
