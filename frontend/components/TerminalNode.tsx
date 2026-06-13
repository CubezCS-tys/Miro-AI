"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<TerminalStatus>("checking");
  const [detail, setDetail] = useState("Checking backend policy");

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
        setEnabled(allowed);
        setStatusValue(allowed ? "idle" : "disabled");
        setDetail(
          allowed
            ? "Ready"
            : "Host terminal locked by backend policy",
        );
      })
      .catch(() => {
        setEnabled(false);
        setStatusValue("disabled");
        setDetail("Backend config unavailable");
      });
  }, [setStatusValue]);

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
        background: "#020617",
        black: "#020617",
        blue: "#38bdf8",
        brightBlack: "#475569",
        brightBlue: "#7dd3fc",
        brightCyan: "#67e8f9",
        brightGreen: "#86efac",
        brightMagenta: "#c4b5fd",
        brightRed: "#fda4af",
        brightWhite: "#f8fafc",
        brightYellow: "#fde68a",
        cursor: "#e2e8f0",
        cyan: "#22d3ee",
        foreground: "#dbeafe",
        green: "#34d399",
        magenta: "#a78bfa",
        red: "#fb7185",
        selectionBackground: "#1e293b",
        white: "#e2e8f0",
        yellow: "#fbbf24",
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
      setDetail("Host terminal locked by backend policy");
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
    const socket = new WebSocket(terminalWebSocketUrl(term.cols || 80, term.rows || 24));
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
  }, [enabled, sendResize, setStatusValue]);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "kill" }));
    }
    socket?.close();
    socketRef.current = null;
    setStatusValue(enabled ? "closed" : "disabled");
    setDetail(enabled ? "Session closed" : "Host terminal locked by backend policy");
  }, [enabled, setStatusValue]);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const connected = status === "connecting" || status === "connected";

  return (
    <div
      className={`glass flex h-full w-full flex-col overflow-hidden rounded-2xl border border-sky-400/25 ${
        selected ? "shadow-[0_0_28px_rgba(56,189,248,0.18)]" : ""
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={380}
        minHeight={260}
        lineClassName="!border-sky-400/60"
        handleClassName="!h-2 !w-2 !rounded-sm !border-0 !bg-sky-400"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-500"
      />
      <div className="flex shrink-0 cursor-grab items-center gap-2 border-b border-white/8 px-3 py-2 active:cursor-grabbing">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300/90">
          {data.title ?? "Terminal"}
        </span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-400">
          {status}
        </span>
        <span className="pointer-events-none min-w-0 flex-1 truncate font-mono text-[10px] text-slate-500">
          {detail}
        </span>
        <button
          onClick={clear}
          className="nodrag rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          Clear
        </button>
        <button
          onClick={connected ? disconnect : connect}
          disabled={status === "checking" || status === "disabled"}
          className="nodrag rounded-lg bg-sky-500/20 px-3 py-1 text-[11px] font-semibold text-sky-100 ring-1 ring-sky-400/40 transition-all hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
      </div>
      <div className="nodrag nowheel relative min-h-0 flex-1 bg-[#020617]">
        <div ref={containerRef} className="h-full w-full p-2" />
        {status === "disabled" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 px-6 text-center text-sm font-medium text-slate-400">
            Host terminal locked by backend policy
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-500"
      />
    </div>
  );
}
