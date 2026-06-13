"""Mocked graph tutor arena state transitions."""

from __future__ import annotations

from typing import Any


def initial_mastery(selection: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        _node_id(node): {
            "label": str(node.get("label") or "Concept"),
            "state": "unknown",
            "score": 0.2,
        }
        for node in selection
    }


def question_for(selection: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    if index >= 5:
        return None
    node = selection[index % len(selection)]
    label = str(node.get("label") or "this concept")
    quote = str(node.get("source_quote") or "No source quote attached.")
    page = node.get("source_page")
    question_types = [
        (
            "source-check",
            f"What does the cited quote prove about {label}, and what does it not prove?",
        ),
        (
            "relation",
            f"Which neighboring claim would become weaker if {label} were removed?",
        ),
        (
            "assumption",
            f"What assumption is needed before reasoning from {label}?",
        ),
        (
            "application",
            f"Give a concrete example where {label} changes the conclusion.",
        ),
        (
            "teach-back",
            f"Explain {label} in two sentences without adding unsupported facts.",
        ),
    ]
    kind, prompt = question_types[index]
    return {
        "id": f"q{index + 1}",
        "kind": kind,
        "node_id": _node_id(node),
        "node_label": label,
        "question": prompt,
        "source_page": page,
        "source_quote": quote,
    }


def evaluate_answer(
    answer: str,
    question: dict[str, Any],
    mastery: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    node_id = str(question["node_id"])
    words = [word for word in answer.strip().split() if word]
    quote = str(question.get("source_quote") or "").lower()
    overlap = sum(1 for word in words if len(word) > 4 and word.lower() in quote)
    if len(words) >= 14 and overlap:
        score = 0.9
        state = "solid"
        verdict = "solid"
    elif len(words) >= 6:
        score = 0.62
        state = "shaky"
        verdict = "partial"
    else:
        score = 0.35
        state = "unknown"
        verdict = "unsupported"
    current = mastery.get(node_id, {"label": question.get("node_label"), "score": 0.2})
    next_score = max(float(current.get("score", 0.2)), score)
    mastery[node_id] = {
        **current,
        "state": state,
        "score": next_score,
    }
    return {
        "verdict": verdict,
        "score": next_score,
        "state": state,
        "feedback": _feedback(verdict, question),
        "missing": _missing(verdict),
    }


def finish_session(
    selection: list[dict[str, Any]], mastery: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    flashcards = [
        {
            "front": f"What source supports {node.get('label', 'this concept')}?",
            "back": str(node.get("source_quote") or "No source quote attached."),
            "node_id": _node_id(node),
        }
        for node in selection
    ]
    path = [
        {
            "step": index + 1,
            "node_id": _node_id(node),
            "title": str(node.get("label") or "Concept"),
            "source_page": node.get("source_page"),
        }
        for index, node in enumerate(selection)
    ]
    weak_nodes = [
        node_id
        for node_id, item in mastery.items()
        if str(item.get("state")) != "solid"
    ]
    return {
        "status": "complete",
        "flashcards": flashcards,
        "presentation_path": path,
        "graph_revision": {
            "summary": "Review shaky nodes before presenting this region.",
            "weak_node_ids": weak_nodes,
            "proposed_edges": [],
        },
    }


def _node_id(node: dict[str, Any]) -> str:
    return str(node.get("node_id") or node.get("id") or node.get("label") or "node")


def _feedback(verdict: str, question: dict[str, Any]) -> str:
    if verdict == "solid":
        return "Good: the answer tied the idea back to the cited source."
    if verdict == "partial":
        return "Partial: the answer is plausible, but it needs a tighter source link."
    return (
        "Unsupported: answer with the cited quote first, then explain the reasoning."
    )


def _missing(verdict: str) -> list[str]:
    if verdict == "solid":
        return []
    if verdict == "partial":
        return ["Name the source quote directly."]
    return ["Use the source quote.", "State the assumption before the conclusion."]
