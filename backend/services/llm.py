"""LLM provider adapter with local cache, rate limiting, and usage capture."""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from db import get_db, init_db

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

QUALITY_MODEL = os.environ.get(
    "MIRO_AI_EXTRACTION_MODEL",
    os.environ.get("MIRO_AI_MODEL", "gemini-3.1-pro-preview"),
)
LIGHT_MODEL = os.environ.get("MIRO_AI_LIGHT_MODEL", "gemini-3.1-flash-lite")
PROVIDER = os.environ.get("MIRO_AI_PROVIDER", "gemini").lower()
FALLBACK_PROVIDER = os.environ.get("MIRO_AI_FALLBACK_PROVIDER", "anthropic").lower()
MAX_RETRIES = int(os.environ.get("MIRO_AI_LLM_RETRIES", "2"))
REQUEST_TIMEOUT_MS = int(os.environ.get("MIRO_AI_LLM_TIMEOUT_MS", "60000"))
RATE_LIMIT_RPM = int(os.environ.get("MIRO_AI_LLM_RPM", "30"))
CACHE_ENABLED = os.environ.get("MIRO_AI_CACHE_ENABLED", "true").lower() != "false"

PRICE_PER_MILLION: dict[str, tuple[float, float]] = {
    "gemini-3.1-pro-preview": (0.125, 0.75),
    "gemini-3.1-flash-lite": (0.05, 0.20),
    "gemini-3.5-flash": (0.10, 0.40),
    "gemini-2.5-flash-lite-preview-09-2025": (0.10, 0.40),
}


class LLMError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMUsage:
    prompt_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class LLMResult:
    parsed: dict[str, Any]
    provider: str
    model: str
    usage: LLMUsage
    cache_hit: bool
    latency_ms: int
    estimated_cost_usd: float


class RateLimiter:
    def __init__(self, rpm: int) -> None:
        self.min_interval = 60 / max(rpm, 1)
        self.next_time = 0.0
        self.lock = threading.Lock()

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            wait_for = max(0.0, self.next_time - now)
            self.next_time = max(now, self.next_time) + self.min_interval
        if wait_for:
            time.sleep(wait_for)


_limiter = RateLimiter(RATE_LIMIT_RPM)
_db_ready = False
_db_lock = threading.Lock()


def generate_json(
    *,
    task: str,
    prompt: str,
    schema: dict[str, Any],
    model_role: str = "quality",
    cache_key: str | None = None,
) -> LLMResult:
    model = QUALITY_MODEL if model_role == "quality" else LIGHT_MODEL
    key = cache_key or make_cache_key(task, PROVIDER, model, prompt, schema)
    if CACHE_ENABLED:
        cached = _read_cache(key)
        if cached:
            result = LLMResult(
                parsed=json.loads(cached["response_json"]),
                provider=cached["provider"],
                model=cached["model"],
                usage=_usage_from_json(cached["usage_json"]),
                cache_hit=True,
                latency_ms=0,
                estimated_cost_usd=0.0,
            )
            _record_call(task, result)
            return result

    try:
        result = _provider_generate(PROVIDER, task, prompt, schema, model)
    except LLMError as primary_error:
        if FALLBACK_PROVIDER and FALLBACK_PROVIDER != PROVIDER:
            try:
                result = _provider_generate(
                    FALLBACK_PROVIDER, task, prompt, schema, model
                )
            except LLMError as fallback_error:
                raise LLMError(
                    f"{PROVIDER} failed: {primary_error}. "
                    f"{FALLBACK_PROVIDER} fallback failed: {fallback_error}"
                ) from fallback_error
        else:
            raise

    if CACHE_ENABLED:
        _write_cache(key, task, result)
    _record_call(task, result)
    return result


def make_cache_key(
    task: str, provider: str, model: str, prompt: str, schema: dict[str, Any]
) -> str:
    digest = hashlib.sha256()
    digest.update(task.encode())
    digest.update(provider.encode())
    digest.update(model.encode())
    digest.update(prompt.encode())
    digest.update(json.dumps(schema, sort_keys=True).encode())
    return digest.hexdigest()


def _provider_generate(
    provider: str, task: str, prompt: str, schema: dict[str, Any], model: str
) -> LLMResult:
    if provider == "mock":
        return _mock_generate(task, prompt, model)
    if provider == "gemini":
        return _gemini_generate(task, prompt, schema, model)
    if provider == "anthropic":
        return _anthropic_generate(task, prompt, schema)
    raise LLMError(f"Unsupported LLM provider: {provider}")


def _gemini_generate(
    task: str, prompt: str, schema: dict[str, Any], model: str
) -> LLMResult:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise LLMError("GEMINI_API_KEY is not set")
    try:
        from google import genai
        from google.genai import errors, types
    except ImportError as exc:
        raise LLMError("google-genai is not installed") from exc

    start = time.monotonic()
    _limiter.wait()
    retry_options = types.HttpRetryOptions(
        attempts=MAX_RETRIES + 1,
        initial_delay=1,
        max_delay=8,
        exp_base=2,
        jitter=0.2,
        http_status_codes=[408, 429, 500, 502, 503, 504],
    )
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=REQUEST_TIMEOUT_MS,
            retry_options=retry_options,
        ),
    )
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_json_schema": schema,
                "temperature": 0.15,
            },
        )
    except errors.APIError as exc:
        raise LLMError(f"Gemini API error for task {task}: {exc.message}") from exc

    parsed = response.parsed if getattr(response, "parsed", None) is not None else None
    if parsed is None:
        parsed = json.loads(response.text or "{}")
    usage = _gemini_usage(getattr(response, "usage_metadata", None))
    latency_ms = int((time.monotonic() - start) * 1000)
    return LLMResult(
        parsed=parsed,
        provider="gemini",
        model=model,
        usage=usage,
        cache_hit=False,
        latency_ms=latency_ms,
        estimated_cost_usd=_estimate_cost(model, usage),
    )


def _anthropic_generate(
    task: str, prompt: str, schema: dict[str, Any]
) -> LLMResult:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise LLMError("ANTHROPIC_API_KEY is not set")
    try:
        import anthropic
    except ImportError as exc:
        raise LLMError("anthropic is not installed") from exc

    model = os.environ.get("MIRO_AI_ANTHROPIC_MODEL", "claude-opus-4-8")
    client = anthropic.Anthropic()
    start = time.monotonic()
    _limiter.wait()
    try:
        with client.messages.stream(
            model=model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.APIError as exc:
        raise LLMError(f"Anthropic API error for task {task}: {exc.message}") from exc
    if message.stop_reason == "refusal":
        raise LLMError(f"Model declined task {task}")
    usage = LLMUsage(
        prompt_tokens=getattr(message.usage, "input_tokens", 0) or 0,
        output_tokens=getattr(message.usage, "output_tokens", 0) or 0,
        total_tokens=(getattr(message.usage, "input_tokens", 0) or 0)
        + (getattr(message.usage, "output_tokens", 0) or 0),
    )
    return LLMResult(
        parsed=json.loads(message.content[-1].text),
        provider="anthropic",
        model=model,
        usage=usage,
        cache_hit=False,
        latency_ms=int((time.monotonic() - start) * 1000),
        estimated_cost_usd=0.0,
    )


def _mock_generate(task: str, prompt: str, model: str) -> LLMResult:
    if task == "generate_artifacts":
        parsed = {
            "artifacts": [
                {
                    "kind": "note",
                    "title": "Mock artifact",
                    "table": {"headers": [], "rows": []},
                    "chart": {"type": "bar", "x_label": "", "y_label": "", "series": []},
                    "note": {"body": "Mocked backend artifact for smoke tests."},
                }
            ]
        }
    elif task == "tutor":
        parsed = {
            "title": "Mock Socratic tutor",
            "questions": [
                {
                    "question": "What source quote most directly supports this concept?",
                    "why": "The reader should verify the selected claim before reasoning from it.",
                    "source_page": 1,
                    "source_quote": "Mock quote",
                },
                {
                    "question": "Which edge in this region would fail if the quote were removed?",
                    "why": "This checks whether the graph relationship is actually grounded.",
                    "source_page": 1,
                    "source_quote": "Mock quote",
                },
            ],
            "weak_links": ["Mock weak link: verify the selected region against the source."],
        }
    else:
        quote, page = _first_page_quote(prompt)
        parsed = {
            "title": "Mock grounded graph",
            "nodes": [
                {
                    "id": "mock-source",
                    "label": "Mock Source",
                    "summary": "A grounded node produced by the mock provider.",
                    "source_quote": quote,
                    "source_page": page,
                    "source_span": {
                        "page": page,
                        "start_char": 0,
                        "end_char": len(quote),
                        "quote": quote,
                        "verified": False,
                    },
                    "kind": "concept",
                }
            ],
            "edges": [],
        }
    return LLMResult(
        parsed=parsed,
        provider="mock",
        model=model,
        usage=LLMUsage(),
        cache_hit=False,
        latency_ms=0,
        estimated_cost_usd=0.0,
    )


def _first_page_quote(prompt: str) -> tuple[str, int]:
    match = re.search(r"<page number=\"(\d+)\">\s*(.*?)\s*</page>", prompt, re.S)
    if not match:
        return "Mock quote", 1
    page = int(match.group(1))
    words = match.group(2).strip().split()
    quote = " ".join(words[:18]) or "Mock quote"
    return quote, page


def _gemini_usage(usage: Any) -> LLMUsage:
    if usage is None:
        return LLMUsage()
    prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    total_tokens = getattr(usage, "total_token_count", 0) or prompt_tokens + output_tokens
    return LLMUsage(
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
    )


def _estimate_cost(model: str, usage: LLMUsage) -> float:
    in_price, out_price = PRICE_PER_MILLION.get(model, (0.0, 0.0))
    return (usage.prompt_tokens * in_price + usage.output_tokens * out_price) / 1_000_000


def _usage_from_json(raw: str | None) -> LLMUsage:
    if not raw:
        return LLMUsage()
    data = json.loads(raw)
    return LLMUsage(
        prompt_tokens=int(data.get("prompt_tokens", 0)),
        output_tokens=int(data.get("output_tokens", 0)),
        total_tokens=int(data.get("total_tokens", 0)),
    )


def _usage_json(usage: LLMUsage) -> str:
    return json.dumps(
        {
            "prompt_tokens": usage.prompt_tokens,
            "output_tokens": usage.output_tokens,
            "total_tokens": usage.total_tokens,
        }
    )


def _read_cache(cache_key: str) -> dict[str, Any] | None:
    _ensure_db()
    with get_db() as conn:
        row = conn.execute(
            "SELECT provider, model, response_json, usage_json FROM llm_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    return dict(row) if row else None


def _write_cache(cache_key: str, task: str, result: LLMResult) -> None:
    _ensure_db()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO llm_cache
               (cache_key, provider, model, task, response_json, usage_json)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(cache_key) DO UPDATE
               SET response_json = excluded.response_json,
                   usage_json = excluded.usage_json""",
            (
                cache_key,
                result.provider,
                result.model,
                task,
                json.dumps(result.parsed),
                _usage_json(result.usage),
            ),
        )


def _record_call(task: str, result: LLMResult) -> None:
    _ensure_db()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO model_calls
               (id, task, provider, model, cache_hit, prompt_tokens, output_tokens,
                total_tokens, estimated_cost_usd, latency_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                uuid.uuid4().hex,
                task,
                result.provider,
                result.model,
                int(result.cache_hit),
                result.usage.prompt_tokens,
                result.usage.output_tokens,
                result.usage.total_tokens,
                result.estimated_cost_usd,
                result.latency_ms,
            ),
        )


def _ensure_db() -> None:
    global _db_ready
    if _db_ready:
        return
    with _db_lock:
        if not _db_ready:
            init_db()
            _db_ready = True
