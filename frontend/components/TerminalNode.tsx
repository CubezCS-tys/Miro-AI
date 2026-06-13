"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import { getConfig, terminalWebSocketUrl } from "@/lib/api";
import {
  hostTerminalConsent,
  subscribeHostTerminalConsent,
} from "@/lib/terminal-preferences";

type TerminalStatus =
  | "checking"
  | "disabled"
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

export type TerminalNodeType = Node<
  { title?: string; runtime?: "host" },
  "terminal"
>;

export function TerminalNode({ data, selected }: NodeProps<TerminalNodeType>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<TerminalStatus>("checking");
  const [backendState, setBackendState] = useState<
    "checking" | "enabled" | "disabled" | "unavailable"
  >("checking");
  const consented = useSyncExternalStore(
    subscribeHostTerminalConsent,
    hostTerminalConsent,
    () => false,
  );
  const [status, setStatus] = useState<TerminalStatus>("checking");
  const [detail, setDetail] = useState("Checking backend policy");
  const enabled = backendState === "enabled" && consented;
  const disabledDetail =
    backendState === "checking"
      ? "Checking backend policy"
      : backendState === "unavailable"
        ? "Backend config unavailable"
        : backendState === "disabled"
          ? "Host terminal locked by backend policy"
          : "Enable host terminal in Settings";

  const setStatusValue = useCallback((next: TerminalStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const sendResize = useCallback(() => {
    const term = terminalRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
      );
    }
  }, []);

  useEffect(() => {
    void getConfig()
      .then((config) => {
        const allowed = config.host_terminal_enabled;
        setBackendState(allowed ? "enabled" : "disabled");
      })
      .catch(() => {
        setBackendState("unavailable");
      });
  }, []);

  useEffect(() => {
    if (backendState === "checking") return;

    if (enabled) {
      if (
        statusRef.current === "checking" ||
        statusRef.current === "disabled"
      ) {
        queueMicrotask(() => {
          setStatusValue("idle");
          setDetail("Ready");
        });
      }
      return;
    }

    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "kill" }));
    }
    socket?.close();
    socketRef.current = null;
    queueMicrotask(() => {
      setStatusValue("disabled");
      setDetail(disabledDetail);
    });
  }, [backendState, disabledDetail, enabled, setStatusValue]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      disableStdin: false,
      fontFamily: "var(--font-geist-mono), Menlo, monospace",
      fontSize: 12,
      scrollback: 1200,
      theme: {
        background: "#0b0b0d",
        black: "#0b0b0d",
        blue: "#d8d8d4",
        brightBlack: "#6f6f69",
        brightBlue: "#ffffff",
        brightCyan: "#ffffff",
        brightGreen: "#ffffff",
        brightMagenta: "#ffffff",
        brightRed: "#ffffff",
        brightWhite: "#ffffff",
        brightYellow: "#ffffff",
        cursor: "#f3f3f1",
        cyan: "#d8d8d4",
        foreground: "#f3f3f1",
        green: "#d8d8d4",
        magenta: "#d8d8d4",
        red: "#d8d8d4",
        selectionBackground: "#1e293b",
        white: "#f3f3f1",
        yellow: "#d8d8d4",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    terminalRef.current = term;
    fitRef.current = fit;

    const input = term.onData((value) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data: value }));
      }
    });
    const observer = new ResizeObserver(() => sendResize());
    observer.observe(containerRef.current);
    requestAnimationFrame(sendResize);

    return () => {
      input.dispose();
      observer.disconnect();
      socketRef.current?.close();
      socketRef.current = null;
      terminalRef.current = null;
      fitRef.current = null;
      term.dispose();
    };
  }, [sendResize]);

  const connect = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    if (!enabled) {
      setStatusValue("disabled");
      setDetail(disabledDetail);
      return;
    }
    const existing = socketRef.current;
    if (
      existing?.readyState === WebSocket.OPEN ||
      existing?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setStatusValue("connecting");
    setDetail("Connecting");
    const socket = new WebSocket(
      terminalWebSocketUrl(term.cols || 80, term.rows || 24),
    );
    socketRef.current = socket;

    socket.onopen = sendResize;

    socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }

      if (message.type === "ready") {
        setStatusValue("connected");
        setDetail(typeof message.cwd === "string" ? message.cwd : "Connected");
        return;
      }
      if (message.type === "output" && typeof message.data === "string") {
        term.write(message.data);
        return;
      }
      if (message.type === "error") {
        const next = String(message.message ?? "Terminal error");
        setStatusValue("error");
        setDetail(next);
        term.writeln(`\r\n${next}`);
        return;
      }
      if (message.type === "exit") {
        setStatusValue("closed");
        setDetail("Session closed");
        socketRef.current = null;
      }
    };

    socket.onerror = () => {
      setStatusValue("error");
      setDetail("WebSocket connection failed");
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (
        statusRef.current === "connecting" ||
        statusRef.current === "connected"
      ) {
        setStatusValue("closed");
        setDetail("Session closed");
      }
    };
  }, [disabledDetail, enabled, sendResize, setStatusValue]);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "kill" }));
    }
    socket?.close();
    socketRef.current = null;
    setStatusValue(enabled ? "closed" : "disabled");
    setDetail(enabled ? "Session closed" : disabledDetail);
  }, [disabledDetail, enabled, setStatusValue]);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const connected = status === "connecting" || status === "connected";

  return (
    <div
      className={`glass flex h-full w-full flex-col overflow-hidden rounded-xl ${
        selected ? "shadow-[var(--shadow-node)]" : ""
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={380}
        minHeight={260}
        lineClassName="!border-line-strong"
        handleClassName="!h-2 !w-2 !rounded-sm !border-0 !bg-fg"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-fg"
      />
      <div className="flex shrink-0 cursor-grab items-center gap-2 border-b border-line px-3 py-2 active:cursor-grabbing">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-line bg-surface" />
          <span className="h-2.5 w-2.5 rounded-full border border-line bg-surface-2" />
          <span className="h-2.5 w-2.5 rounded-full border border-line bg-faint" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">
          {data.title ?? "Terminal"}
        </span>
        <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted">
          {status}
        </span>
        <span className="pointer-events-none min-w-0 flex-1 truncate font-mono text-[10px] text-faint">
          {detail}
        </span>
        <button
          onClick={clear}
          className="nodrag rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Clear
        </button>
        <button
          onClick={connected ? disconnect : connect}
          disabled={status === "checking" || status === "disabled"}
          className="nodrag rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
      </div>
      <div className="nodrag nowheel relative min-h-0 flex-1 bg-[#0b0b0d]">
        <div ref={containerRef} className="h-full w-full p-2" />
        {status === "disabled" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm font-medium text-white/70">
            {disabledDetail}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-fg"
      />
    </div>
  );
}
