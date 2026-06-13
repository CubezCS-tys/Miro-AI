import asyncio
import os
import pty
import signal
import struct
import subprocess
import tempfile
import termios
import time
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


DEFAULT_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SECRET_NAME_PARTS = (
    "API",
    "AUTH",
    "CREDENTIAL",
    "GEMINI",
    "KEY",
    "OPENAI",
    "ANTHROPIC",
    "PASSWORD",
    "SECRET",
    "TOKEN",
)


class TerminalError(RuntimeError):
    pass


@dataclass(frozen=True)
class TerminalSettings:
    max_sessions: int = 2
    idle_timeout_seconds: int = 300
    max_output_bytes: int = 200_000
    max_input_bytes: int = 4096


def terminal_available() -> bool:
    return os.name == "posix" and hasattr(os, "setsid")


def terminal_settings_from_env(
    env: Mapping[str, str] | None = None,
) -> TerminalSettings:
    source = env or os.environ
    return TerminalSettings(
        max_sessions=_env_int(source, "MIRO_AI_TERMINAL_MAX_SESSIONS", 2, 1, 8),
        idle_timeout_seconds=_env_int(
            source, "MIRO_AI_TERMINAL_IDLE_TIMEOUT_SECONDS", 300, 10, 3600
        ),
        max_output_bytes=_env_int(
            source, "MIRO_AI_TERMINAL_MAX_OUTPUT_BYTES", 200_000, 4096, 2_000_000
        ),
        max_input_bytes=_env_int(
            source, "MIRO_AI_TERMINAL_MAX_INPUT_BYTES", 4096, 256, 16_384
        ),
    )


def sanitize_environment(
    source: Mapping[str, str] | None = None,
    *,
    cwd: str,
    shell: str,
) -> dict[str, str]:
    raw = source or os.environ
    env = {
        "HOME": cwd,
        "LANG": raw.get("LANG", "C.UTF-8"),
        "LC_CTYPE": raw.get("LC_CTYPE", raw.get("LANG", "C.UTF-8")),
        "PATH": DEFAULT_PATH,
        "PS1": "$ ",
        "SHELL": shell,
        "TERM": "xterm-256color",
        "TMPDIR": cwd,
    }
    for name in ("LOGNAME", "USER"):
        value = raw.get(name)
        if value and not _looks_secret(name):
            env[name] = value
    return env


def pick_shell(source: Mapping[str, str] | None = None) -> str:
    raw = source or os.environ
    candidates = [raw.get("SHELL", ""), "/bin/bash", "/bin/sh"]
    for candidate in candidates:
        path = Path(candidate)
        if path.is_absolute() and path.exists() and os.access(path, os.X_OK):
            return str(path)
    raise TerminalError("No usable POSIX shell was found")


def clamp_dimensions(cols: int, rows: int) -> tuple[int, int]:
    return max(20, min(cols, 240)), max(5, min(rows, 80))


def _env_int(
    env: Mapping[str, str],
    name: str,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    raw = env.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise TerminalError(f"{name} must be an integer") from exc
    return max(minimum, min(value, maximum))


def _looks_secret(name: str) -> bool:
    upper = name.upper()
    return any(part in upper for part in SECRET_NAME_PARTS)


def _shell_args(shell: str) -> list[str]:
    name = Path(shell).name
    if name == "bash":
        return [shell, "--noprofile", "--norc"]
    if name == "zsh":
        return [shell, "-f"]
    return [shell]


@dataclass
class TerminalSession:
    id: str
    cwd: tempfile.TemporaryDirectory[str]
    master_fd: int
    process: subprocess.Popen[bytes]
    shell: str
    last_activity: float
    output_bytes: int = 0
    closed: bool = False

    @classmethod
    def start(cls, cols: int, rows: int) -> "TerminalSession":
        if not terminal_available():
            raise TerminalError("Host terminal requires a POSIX PTY")
        cols, rows = clamp_dimensions(cols, rows)
        cwd = tempfile.TemporaryDirectory(prefix="miro-ai-terminal-")
        shell = pick_shell()
        master_fd, slave_fd = pty.openpty()
        try:
            os.set_blocking(master_fd, False)
            _resize_fd(master_fd, cols, rows)
            process = subprocess.Popen(
                _shell_args(shell),
                cwd=cwd.name,
                env=sanitize_environment(cwd=cwd.name, shell=shell),
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                close_fds=True,
                preexec_fn=os.setsid,
            )
        except Exception:
            os.close(master_fd)
            cwd.cleanup()
            raise
        finally:
            os.close(slave_fd)

        return cls(
            id=f"term-{process.pid}",
            cwd=cwd,
            master_fd=master_fd,
            process=process,
            shell=shell,
            last_activity=time.monotonic(),
        )

    def is_running(self) -> bool:
        return self.process.poll() is None and not self.closed

    def idle_seconds(self) -> float:
        return time.monotonic() - self.last_activity

    def write(self, data: str, max_input_bytes: int) -> None:
        encoded = data.encode()
        if len(encoded) > max_input_bytes:
            raise TerminalError(
                f"Terminal input chunk exceeds {max_input_bytes} bytes"
            )
        self.last_activity = time.monotonic()
        os.write(self.master_fd, encoded)

    def resize(self, cols: int, rows: int) -> None:
        cols, rows = clamp_dimensions(cols, rows)
        _resize_fd(self.master_fd, cols, rows)
        self.last_activity = time.monotonic()

    async def output(self):
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        def on_readable() -> None:
            try:
                chunk = os.read(self.master_fd, 8192)
            except BlockingIOError:
                return
            except OSError:
                queue.put_nowait(None)
                return
            if chunk:
                queue.put_nowait(chunk)
            else:
                queue.put_nowait(None)

        loop.add_reader(self.master_fd, on_readable)
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                self.last_activity = time.monotonic()
                self.output_bytes += len(chunk)
                yield chunk.decode(errors="replace")
        finally:
            loop.remove_reader(self.master_fd)

    def terminate(self) -> None:
        if self.closed:
            return
        self.closed = True
        if self.process.poll() is None:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
                self.process.wait(timeout=1)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(self.process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                self.process.wait(timeout=1)
        try:
            os.close(self.master_fd)
        except OSError:
            pass
        self.cwd.cleanup()


class TerminalManager:
    def __init__(self, settings: TerminalSettings) -> None:
        self.settings = settings
        self.sessions: dict[str, TerminalSession] = {}
        self._lock = asyncio.Lock()

    async def create(self, cols: int, rows: int) -> TerminalSession:
        async with self._lock:
            if len(self.sessions) >= self.settings.max_sessions:
                raise TerminalError(
                    f"Host terminal session limit reached: {self.settings.max_sessions}"
                )
            session = TerminalSession.start(cols, rows)
            self.sessions[session.id] = session
            return session

    async def remove(self, session_id: str) -> None:
        async with self._lock:
            session = self.sessions.pop(session_id, None)
        if session:
            session.terminate()


def _resize_fd(fd: int, cols: int, rows: int) -> None:
    payload = struct.pack("HHHH", rows, cols, 0, 0)
    try:
        import fcntl

        fcntl.ioctl(fd, termios.TIOCSWINSZ, payload)
    except OSError:
        pass
