"""Mocked research frontier proposal generation."""

from __future__ import annotations

import re
import uuid
from typing import Any


def build_mock_frontier(
    *, board_id: str, query: str | None, selection: list[dict[str, Any]]
) -> dict[str, Any]:
    if not selection:
        raise ValueError("Select at least one node before expanding the frontier")
    anchor = selection[0]
    anchor_label = str(anchor.get("label") or "selected concept")
    anchor_node_id = str(anchor.get("node_id") or anchor.get("id") or anchor_label)
    topic = (query or anchor_label).strip()
    base_slug = _slug(topic)
    source_id = f"src-{uuid.uuid4().hex[:10]}"
    source_title = f"Mock research frontier for {anchor_label}"
    source_text = (
        f"Mock source argues that {anchor_label} needs stronger evidence from "
        "nearby literature. A counterpoint warns that the claim can fail when "
        "the assumptions are too narrow. A bridge question asks which missing "
        "mechanism links the local graph to a broader explanation."
    )
    nodes = [
        _node(
            f"{base_slug}-support",
            "Frontier Evidence",
            f"Additional evidence can strengthen the selected claim about {anchor_label}.",
            "Mock source argues that "
            f"{anchor_label} needs stronger evidence from nearby literature.",
            "entity",
        ),
        _node(
            f"{base_slug}-counterpoint",
            "Counter Pressure",
            f"The selected claim about {anchor_label} may be brittle under narrower assumptions.",
            "A counterpoint warns that the claim can fail when the assumptions are too narrow.",
            "concept",
        ),
        _node(
            f"{base_slug}-bridge",
            "Bridge Question",
            f"A missing mechanism could connect {anchor_label} to a broader explanation.",
            "A bridge question asks which missing mechanism links the local graph to a broader explanation.",
            "process",
        ),
    ]
    claims = [
        _claim(source_id, nodes[0], "supports", 0.78),
        _claim(source_id, nodes[1], "contradicts", 0.68),
        _claim(source_id, nodes[2], "context", 0.72),
    ]
    return {
        "board_id": board_id,
        "query": topic,
        "budget": "mock",
        "sources": [
            {
                "id": source_id,
                "kind": "mock",
                "title": source_title,
                "url": None,
                "local_path": None,
                "sha256": uuid.uuid5(uuid.NAMESPACE_URL, source_text).hex,
                "content_text": source_text,
                "metadata": {"provider": "mock", "selected_anchor": anchor_label},
            }
        ],
        "claims": claims,
        "nodes": nodes,
        "edges": [
            {
                "source": anchor_node_id,
                "target": nodes[0]["id"],
                "label": "supports",
                "kind": "supports",
            },
            {
                "source": nodes[1]["id"],
                "target": anchor_node_id,
                "label": "challenges",
                "kind": "contradicts",
            },
            {
                "source": anchor_node_id,
                "target": nodes[2]["id"],
                "label": "needs bridge",
                "kind": "context",
            },
        ],
    }


def _node(
    node_id: str, label: str, summary: str, quote: str, kind: str
) -> dict[str, Any]:
    return {
        "id": node_id,
        "label": label,
        "summary": summary,
        "source_quote": quote,
        "source_page": 1,
        "source_span": {
            "page": 1,
            "start_char": None,
            "end_char": None,
            "quote": quote,
            "verified": True,
        },
        "kind": kind,
    }


def _claim(
    source_id: str, node: dict[str, Any], stance: str, confidence: float
) -> dict[str, Any]:
    return {
        "id": f"claim-{uuid.uuid4().hex[:10]}",
        "source_id": source_id,
        "text": node["summary"],
        "quote": node["source_quote"],
        "page": node["source_page"],
        "start_char": None,
        "end_char": None,
        "url_anchor": None,
        "stance": stance,
        "confidence": confidence,
    }


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return f"frontier-{slug or 'cluster'}"
