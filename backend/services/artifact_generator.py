"""Free-form AI generation: user prompt (+ board context) -> visual artifacts.

Artifacts are typed objects the canvas knows how to render: tables, charts,
and note cards. One schema, every kind always present — the unused sections
stay empty, which keeps the structured-output contract simple and strict.
"""

import os

import anthropic
from pydantic import BaseModel

from services.graph_extractor import MODEL

MAX_CONTEXT_CHARS = 300_000


class Table(BaseModel):
    headers: list[str]
    rows: list[list[str]]


class ChartPoint(BaseModel):
    label: str
    value: float


class ChartSeries(BaseModel):
    name: str
    points: list[ChartPoint]


class Chart(BaseModel):
    type: str  # bar | line | area | pie
    x_label: str
    y_label: str
    series: list[ChartSeries]


class Note(BaseModel):
    body: str


class Artifact(BaseModel):
    kind: str  # table | chart | note
    title: str
    table: Table
    chart: Chart
    note: Note


class ArtifactBundle(BaseModel):
    artifacts: list[Artifact]


ARTIFACT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "artifacts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "kind": {"type": "string", "enum": ["table", "chart", "note"]},
                    "title": {"type": "string"},
                    "table": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "headers": {"type": "array", "items": {"type": "string"}},
                            "rows": {
                                "type": "array",
                                "items": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                        },
                        "required": ["headers", "rows"],
                    },
                    "chart": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["bar", "line", "area", "pie"],
                            },
                            "x_label": {"type": "string"},
                            "y_label": {"type": "string"},
                            "series": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "name": {"type": "string"},
                                        "points": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "properties": {
                                                    "label": {"type": "string"},
                                                    "value": {"type": "number"},
                                                },
                                                "required": ["label", "value"],
                                            },
                                        },
                                    },
                                    "required": ["name", "points"],
                                },
                            },
                        },
                        "required": ["type", "x_label", "y_label", "series"],
                    },
                    "note": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {"body": {"type": "string"}},
                        "required": ["body"],
                    },
                },
                "required": ["kind", "title", "table", "chart", "note"],
            },
        }
    },
    "required": ["artifacts"],
}

GENERATION_PROMPT = """\
You are the generative engine of an AI visual whiteboard. The user types a \
request; you answer with visual artifacts that get placed on their board.

Artifact kinds:
- table — comparisons, feature matrices, structured breakdowns
- chart — quantitative data only (bar, line, area, pie)
- note — short prose: explanations, summaries, lists

Rules:
- Produce 1-4 artifacts. One excellent artifact beats three mediocre ones; \
only produce several when the request genuinely calls for it.
- For each artifact fill ONLY the section matching its kind; leave the other \
sections empty (empty arrays / empty strings).
- When board context is provided, ground every fact and number in it. Never \
invent numbers that contradict or aren't supported by the context.
- Without context, draw on general knowledge and make assumptions explicit \
in a note.
- Charts need real quantitative data. If the data is qualitative, use a \
table instead.
- Keep tables under ~10 rows and titles short.

{context_block}User request: {prompt}"""

client = anthropic.Anthropic()


def generate_artifacts(prompt: str, context: str = "") -> list[Artifact]:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set — export it before starting the backend"
        )
    context_block = ""
    if context.strip():
        context_block = (
            f"<board_context>\n{context[:MAX_CONTEXT_CHARS]}\n</board_context>\n\n"
        )
    with client.messages.stream(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={"format": {"type": "json_schema", "schema": ARTIFACT_SCHEMA}},
        messages=[
            {
                "role": "user",
                "content": GENERATION_PROMPT.format(
                    context_block=context_block, prompt=prompt
                ),
            }
        ],
    ) as stream:
        message = stream.get_final_message()

    if message.stop_reason == "refusal":
        raise RuntimeError("Model declined this request")

    bundle = ArtifactBundle.model_validate_json(message.content[-1].text)
    return bundle.artifacts
