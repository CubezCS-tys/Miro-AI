"""Grounded Socratic tutor generation."""

import json
from typing import Any

from pydantic import BaseModel

from services.llm import generate_json


class TutorQuestion(BaseModel):
    question: str
    why: str
    source_page: int | None = None
    source_quote: str


class TutorResponse(BaseModel):
    title: str
    questions: list[TutorQuestion]
    weak_links: list[str]


TUTOR_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "question": {"type": "string"},
                    "why": {"type": "string"},
                    "source_page": {
                        "anyOf": [{"type": "integer"}, {"type": "null"}]
                    },
                    "source_quote": {"type": "string"},
                },
                "required": ["question", "why", "source_page", "source_quote"],
            },
        },
        "weak_links": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "questions", "weak_links"],
}


TUTOR_PROMPT = """\
You are a Socratic tutor for a source-grounded knowledge graph.

Use only the selected nodes below. Ask questions that help the reader expose
missing assumptions, weak edges, and conceptual confusion. Every question must
cite the source page and quote it is grounded in.

Rules:
- Produce 3-5 questions.
- Do not answer the questions for the user.
- Weak links must be concrete gaps or suspicious jumps in the selected region.
- If grounding is weak, say what must be checked in the source.

<selected_nodes>
{selection}
</selected_nodes>

Focus: {focus}
"""


def generate_tutor(
    selection: list[dict[str, Any]], focus: str | None = None
) -> TutorResponse:
    prompt = TUTOR_PROMPT.format(
        selection=json.dumps(selection, ensure_ascii=False),
        focus=(focus or "Help me understand and test this region."),
    )
    result = generate_json(
        task="tutor",
        prompt=prompt,
        schema=TUTOR_SCHEMA,
        model_role="light",
    )
    return TutorResponse.model_validate(result.parsed)
