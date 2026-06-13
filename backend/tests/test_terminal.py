import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def load_app(tmp_path, monkeypatch, *, terminal_enabled: bool = False):
    monkeypatch.setenv("MIRO_AI_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MIRO_AI_PROVIDER", "mock")
    monkeypatch.setenv("MIRO_AI_FALLBACK_PROVIDER", "")
    monkeypatch.setenv("MIRO_AI_ENABLE_SERVER_EXECUTION", "false")
    monkeypatch.setenv(
        "MIRO_AI_ENABLE_HOST_TERMINAL",
        "true" if terminal_enabled else "false",
    )
    monkeypatch.setenv("MIRO_AI_TERMINAL_IDLE_TIMEOUT_SECONDS", "10")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    for name in [
        "main",
        "db",
        "services.terminal",
        "services.llm",
        "services.graph_extractor",
        "services.artifact_generator",
        "services.tutor",
        "services.frontier",
        "services.arena",
    ]:
        sys.modules.pop(name, None)
    return importlib.import_module("main")


def test_terminal_config_is_disabled_by_default(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    body = client.get("/config").json()

    assert body["host_terminal_enabled"] is False
    assert body["terminal_runtime"] == "disabled"


def test_terminal_websocket_is_disabled_by_default(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch)
    client = TestClient(main.app)

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/terminal/sessions"):
            pass

    assert exc.value.code == 1008


def test_terminal_websocket_rejects_untrusted_origin(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch, terminal_enabled=True)
    client = TestClient(main.app)

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(
            "/terminal/sessions",
            headers={"origin": "https://evil.example"},
        ):
            pass

    assert exc.value.code == 1008


def test_terminal_environment_is_scrubbed(monkeypatch):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.modules.pop("services.terminal", None)
    terminal = importlib.import_module("services.terminal")

    env = terminal.sanitize_environment(
        {
            "ANTHROPIC_API_KEY": "secret",
            "GEMINI_API_KEY": "secret",
            "LANG": "en_GB.UTF-8",
            "PATH": "/unsafe/bin",
            "USER": "zain",
        },
        cwd="/tmp/miro-ai-terminal-test",
        shell="/bin/bash",
    )

    assert "ANTHROPIC_API_KEY" not in env
    assert "GEMINI_API_KEY" not in env
    assert env["HOME"] == "/tmp/miro-ai-terminal-test"
    assert env["TMPDIR"] == "/tmp/miro-ai-terminal-test"
    assert env["PATH"] == terminal.DEFAULT_PATH
    assert env["USER"] == "zain"


def test_terminal_dimensions_and_settings_are_bounded(monkeypatch):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.modules.pop("services.terminal", None)
    terminal = importlib.import_module("services.terminal")

    assert terminal.clamp_dimensions(1, 1) == (20, 5)
    assert terminal.clamp_dimensions(999, 999) == (240, 80)

    settings = terminal.terminal_settings_from_env(
        {
            "MIRO_AI_TERMINAL_MAX_SESSIONS": "100",
            "MIRO_AI_TERMINAL_IDLE_TIMEOUT_SECONDS": "1",
            "MIRO_AI_TERMINAL_MAX_OUTPUT_BYTES": "10",
            "MIRO_AI_TERMINAL_MAX_INPUT_BYTES": "999999",
        }
    )

    assert settings.max_sessions == 8
    assert settings.idle_timeout_seconds == 10
    assert settings.max_output_bytes == 4096
    assert settings.max_input_bytes == 16_384


def test_terminal_websocket_echoes_when_enabled(tmp_path, monkeypatch):
    main = load_app(tmp_path, monkeypatch, terminal_enabled=True)
    if not main.terminal_available():
        pytest.skip("POSIX PTY is not available")
    client = TestClient(main.app)

    with client.websocket_connect("/terminal/sessions?cols=82&rows=20") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        assert "miro-ai-terminal" in ready["cwd"]

        ws.send_json({"type": "resize", "cols": 120, "rows": 32})
        ws.send_json({"type": "input", "data": "echo terminal-ok\r"})
        output = _receive_output_until(ws, "terminal-ok")
        ws.send_json({"type": "kill"})

    assert "terminal-ok" in output
    assert main.TERMINAL_MANAGER.sessions == {}


def test_terminal_output_limit_stops_session(tmp_path, monkeypatch):
    monkeypatch.setenv("MIRO_AI_TERMINAL_MAX_OUTPUT_BYTES", "4096")
    main = load_app(tmp_path, monkeypatch, terminal_enabled=True)
    if not main.terminal_available():
        pytest.skip("POSIX PTY is not available")
    client = TestClient(main.app)

    with client.websocket_connect("/terminal/sessions?cols=80&rows=20") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        ws.send_json({"type": "input", "data": "yes x | head -c 10000\r"})
        message = _receive_until(
            ws,
            lambda item: item.get("type") == "error"
            and "output limit" in item.get("message", ""),
        )

    assert message["type"] == "error"
    assert main.TERMINAL_MANAGER.sessions == {}


def _receive_output_until(ws, expected: str, limit: int = 40) -> str:
    output = ""
    for _ in range(limit):
        message = ws.receive_json()
        if message.get("type") == "output":
            output += message.get("data", "")
        if expected in output:
            return output
    raise AssertionError(f"Expected terminal output containing {expected!r}")


def _receive_until(ws, predicate, limit: int = 80):
    for _ in range(limit):
        message = ws.receive_json()
        if predicate(message):
            return message
    raise AssertionError("Expected WebSocket message was not received")
