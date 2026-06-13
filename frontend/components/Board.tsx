"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { DocumentNode, type DocumentMeta } from "./DocumentNode";
import { KnowledgeNode } from "./KnowledgeNode";
import { TextNode } from "./TextNode";
import { StickyNode } from "./StickyNode";
import { ShapeNode, type ShapeKind } from "./ShapeNode";
import { CodeNode } from "./CodeNode";
import { TableNode } from "./TableNode";
import { ChartNode } from "./ChartNode";
import { NoteNode } from "./NoteNode";
import { NodePanel } from "./NodePanel";
import { computeLayout } from "@/lib/layout";
import { BoardContext, type BoardActions } from "@/lib/board-context";
import { useUndoRedo } from "@/lib/use-undo-redo";
import { COLOR_NAMES, SWATCH_BG, type ColorName } from "@/lib/colors";
import {
  analyzeDocument,
  generateArtifacts,
  getBoard,
  getCanvas,
  saveBoard,
  uploadDocument,
} from "@/lib/api";
import type { GraphNode } from "@/lib/types";

const nodeTypes = {
  knowledge: KnowledgeNode,
  document: DocumentNode,
  text: TextNode,
  sticky: StickyNode,
  shape: ShapeNode,
  code: CodeNode,
  table: TableNode,
  chart: ChartNode,
  note: NoteNode,
};

type BoardNode = Node;

interface Clipboard {
  nodes: BoardNode[];
  edges: Edge[];
}

let idCounter = 0;
const freshId = (kind: string) => `${kind}-${Date.now()}-${idCounter++}`;

const COLORABLE = new Set(["sticky", "shape"]);

function BoardInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [editingEdge, setEditingEdge] = useState<{
    id: string;
    x: number;
    y: number;
    value: string;
  } | null>(null);

  const { screenToFlowPosition, fitView, getNode, getNodes, getEdges } =
    useReactFlow();
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboard = useRef<Clipboard | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });

  const { takeSnapshot, undo, redo } = useUndoRedo(setNodes, setEdges);

  // ---- load persisted board ----
  useEffect(() => {
    getBoard()
      .then((state) => {
        const restored = (state.nodes as BoardNode[]).map((n) => {
          if (n.type !== "document") return n;
          const meta = n.data as DocumentMeta;
          if (meta.status === "uploading")
            return { ...n, data: { ...meta, status: "error", error: "Interrupted — drop the file again" } };
          if (meta.status === "analyzing")
            return { ...n, data: { ...meta, status: "pending" } };
          return n;
        });
        setNodes(restored);
        setEdges(state.edges as Edge[]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [setNodes, setEdges]);

  // ---- debounced persistence ----
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveBoard({ nodes, edges }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, loaded]);

  const patchNode = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  // ---- clipboard ----
  const copySelection = useCallback(() => {
    const sel = getNodes().filter((n) => n.selected);
    if (!sel.length) return;
    const ids = new Set(sel.map((n) => n.id));
    const selEdges = getEdges().filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    clipboard.current = JSON.parse(
      JSON.stringify({ nodes: sel, edges: selEdges }),
    );
  }, [getNodes, getEdges]);

  const paste = useCallback(() => {
    const clip = clipboard.current;
    if (!clip?.nodes.length) return;
    takeSnapshot();
    const idMap = new Map<string, string>();
    const newNodes = clip.nodes.map((n) => {
      const id = freshId(n.type ?? "node");
      idMap.set(n.id, id);
      return {
        ...n,
        id,
        position: { x: n.position.x + 28, y: n.position.y + 28 },
        selected: true,
      };
    });
    const newEdges = clip.edges.map((e) => ({
      ...e,
      id: freshId("edge"),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
      selected: false,
    }));
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((es) => [...es, ...newEdges]);
    // cascade repeated pastes
    clip.nodes = clip.nodes.map((n) => ({
      ...n,
      position: { x: n.position.x + 28, y: n.position.y + 28 },
    }));
  }, [takeSnapshot, setNodes, setEdges]);

  const duplicateSelection = useCallback(() => {
    copySelection();
    paste();
  }, [copySelection, paste]);

  const deleteSelection = useCallback(() => {
    const selIds = new Set(getNodes().filter((n) => n.selected).map((n) => n.id));
    const selEdgeIds = new Set(getEdges().filter((e) => e.selected).map((e) => e.id));
    if (!selIds.size && !selEdgeIds.size) return;
    takeSnapshot();
    setNodes((ns) => ns.filter((n) => !selIds.has(n.id)));
    setEdges((es) =>
      es.filter(
        (e) =>
          !selEdgeIds.has(e.id) && !selIds.has(e.source) && !selIds.has(e.target),
      ),
    );
  }, [getNodes, getEdges, takeSnapshot, setNodes, setEdges]);

  const applyColor = useCallback(
    (color: ColorName) => {
      takeSnapshot();
      setNodes((ns) =>
        ns.map((n) =>
          n.selected && COLORABLE.has(n.type ?? "")
            ? { ...n, data: { ...n.data, color } }
            : n,
        ),
      );
    },
    [takeSnapshot, setNodes],
  );

  // ---- whiteboard primitives ----
  const addNodeAt = useCallback(
    (
      type: "text" | "sticky" | "shape" | "code",
      position: { x: number; y: number },
      shape: ShapeKind = "rect",
    ) => {
      takeSnapshot();
      const node: BoardNode =
        type === "text"
          ? { id: freshId(type), type, position, data: { text: "" } }
          : type === "sticky"
            ? {
                id: freshId(type),
                type,
                position,
                data: { text: "", color: "amber" },
                style: { width: 200, height: 140 },
              }
            : type === "code"
              ? {
                  id: freshId(type),
                  type,
                  position,
                  data: {
                    code: 'print("hello from the board")\n',
                    result: null,
                  },
                  style: { width: 460, height: 380 },
                }
              : {
                  id: freshId(type),
                  type,
                  position,
                  data: { label: "", shape, color: "cyan" },
                  style: { width: 160, height: 110 },
                };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
    },
    [takeSnapshot, setNodes],
  );

  const addAtCursor = useCallback(
    (type: "text" | "sticky" | "shape" | "code", shape: ShapeKind = "rect") => {
      addNodeAt(type, screenToFlowPosition(mousePos.current), shape);
    },
    [addNodeAt, screenToFlowPosition],
  );

  const addNodeAtCenter = useCallback(
    (type: "text" | "sticky" | "shape" | "code", shape: ShapeKind = "rect") => {
      addNodeAt(
        type,
        screenToFlowPosition({
          x: window.innerWidth / 2 - 100,
          y: window.innerHeight / 2 - 60,
        }),
        shape,
      );
    },
    [addNodeAt, screenToFlowPosition],
  );

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((mod && k === "z" && e.shiftKey) || (mod && k === "y")) {
        e.preventDefault();
        redo();
      } else if (mod && k === "c") {
        copySelection();
      } else if (mod && k === "v") {
        e.preventDefault();
        paste();
      } else if (mod && k === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && k === "a") {
        e.preventDefault();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
      } else if (!mod && !e.altKey) {
        if (k === "t") addAtCursor("text");
        else if (k === "s") addAtCursor("sticky");
        else if (k === "r") addAtCursor("shape", "rect");
        else if (k === "o") addAtCursor("shape", "ellipse");
        else if (k === "d") addAtCursor("shape", "diamond");
        else if (k === "c") addAtCursor("code");
        else if (k === "escape") {
          setSelected(null);
          setEditingEdge(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, copySelection, paste, duplicateSelection, addAtCursor, setNodes]);

  // ---- phase 1: drop -> upload & parse -> awaiting brief ----
  const ingest = useCallback(
    async (file: File, position: { x: number; y: number }) => {
      takeSnapshot();
      const docNodeId = freshId("doc");
      setNodes((ns) => [
        ...ns,
        {
          id: docNodeId,
          type: "document",
          position,
          data: { filename: file.name, status: "uploading" } satisfies DocumentMeta,
        },
      ]);
      try {
        const { document_id } = await uploadDocument(file);
        patchNode(docNodeId, { status: "pending", documentId: document_id });
      } catch (e) {
        patchNode(docNodeId, {
          status: "error",
          error: e instanceof Error ? e.message : "Upload failed",
        });
      }
    },
    [takeSnapshot, setNodes, patchNode],
  );

  // ---- phase 2: user brief -> extraction -> graph on board ----
  const generateFromDocument = useCallback(
    async (docNodeId: string, intent: string | null) => {
      const docNode = getNode(docNodeId);
      const documentId = (docNode?.data as DocumentMeta | undefined)?.documentId;
      if (!docNode || !documentId) return;
      const position = docNode.position;
      patchNode(docNodeId, { status: "analyzing" });

      try {
        const { canvas_id } = await analyzeDocument(documentId, intent);
        const canvas = await getCanvas(canvas_id);
        const layout = await computeLayout(canvas.graph);

        const prefix = canvas_id.slice(0, 8);
        const xs = canvas.graph.nodes.map((n) => layout[n.id]?.x ?? 0);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const offsetX = position.x + 130 - (minX + maxX) / 2 - 100;
        const offsetY = position.y + 180;

        const newNodes: BoardNode[] = canvas.graph.nodes.map((concept) => ({
          id: `${prefix}-${concept.id}`,
          type: "knowledge",
          position: {
            x: (layout[concept.id]?.x ?? 0) + offsetX,
            y: (layout[concept.id]?.y ?? 0) + offsetY,
          },
          data: { concept },
        }));

        const hasIncoming = new Set(canvas.graph.edges.map((e) => e.target));
        const roots = canvas.graph.nodes.filter((n) => !hasIncoming.has(n.id));

        const newEdges: Edge[] = [
          ...canvas.graph.edges.map((e, i) => ({
            id: `${prefix}-e${i}`,
            source: `${prefix}-${e.source}`,
            target: `${prefix}-${e.target}`,
            label: e.label,
            style: { stroke: "rgba(100,116,139,0.5)" },
          })),
          ...roots.map((r) => ({
            id: `${prefix}-root-${r.id}`,
            source: docNodeId,
            target: `${prefix}-${r.id}`,
            animated: true,
            style: { stroke: "rgba(34,211,238,0.45)" },
          })),
        ];

        takeSnapshot();
        patchNode(docNodeId, {
          status: "ready",
          title: canvas.title,
          nodeCount: canvas.graph.nodes.length,
        });
        setNodes((ns) => [...ns, ...newNodes]);
        setEdges((es) => [...es, ...newEdges]);
        setTimeout(() => fitView({ duration: 800, padding: 0.15 }), 50);
      } catch (e) {
        patchNode(docNodeId, {
          status: "error",
          error: e instanceof Error ? e.message : "Extraction failed",
        });
      }
    },
    [getNode, patchNode, takeSnapshot, setNodes, setEdges, fitView],
  );

  const actions = useMemo<BoardActions>(
    () => ({ updateNodeData: patchNode, generateFromDocument }),
    [patchNode, generateFromDocument],
  );

  // ---- AI command bar ----
  const runAiPrompt = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const documentIds = nodes
        .filter((n) => n.type === "document")
        .map((n) => (n.data as DocumentMeta).documentId)
        .filter((id): id is string => Boolean(id));
      const selection = nodes
        .filter((n) => n.selected && n.type === "knowledge")
        .map((n) => {
          const c = (n.data as { concept: GraphNode }).concept;
          return { label: c.label, summary: c.summary };
        });

      const { artifacts } = await generateArtifacts(prompt, documentIds, selection);

      takeSnapshot();
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2 - 80,
      });
      setNodes((ns) => [
        ...ns,
        ...artifacts.map((artifact, i) => ({
          id: freshId(artifact.kind),
          type: artifact.kind,
          position: { x: center.x - 180 + i * 60, y: center.y - 120 + i * 60 },
          data: { artifact },
        })),
      ]);
      setAiPrompt("");
      setTimeout(() => fitView({ duration: 600, padding: 0.15 }), 50);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, aiBusy, nodes, takeSnapshot, screenToFlowPosition, setNodes, fitView]);

  // ---- canvas events ----
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
      addNodeAt("text", screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNodeAt, screenToFlowPosition],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      takeSnapshot();
      setEdges((es) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(148,163,184,0.7)" },
            style: { stroke: "rgba(148,163,184,0.55)", strokeWidth: 1.5 },
          },
          es,
        ),
      );
    },
    [takeSnapshot, setEdges],
  );

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback((e, edge) => {
    setEditingEdge({
      id: edge.id,
      x: e.clientX,
      y: e.clientY,
      value: typeof edge.label === "string" ? edge.label : "",
    });
  }, []);

  const commitEdgeLabel = useCallback(() => {
    if (!editingEdge) return;
    takeSnapshot();
    setEdges((es) =>
      es.map((e) =>
        e.id === editingEdge.id
          ? { ...e, label: editingEdge.value || undefined }
          : e,
      ),
    );
    setEditingEdge(null);
  }, [editingEdge, takeSnapshot, setEdges]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      void ingest(file, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [ingest, screenToFlowPosition],
  );

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      void ingest(
        file,
        screenToFlowPosition({ x: window.innerWidth / 2 - 130, y: window.innerHeight / 3 }),
      );
    },
    [ingest, screenToFlowPosition],
  );

  const onNodeClick: NodeMouseHandler<BoardNode> = useCallback((_, node) => {
    if (node.type === "knowledge") {
      setSelected((node.data as { concept: GraphNode }).concept);
    }
  }, []);

  const selectionCount = nodes.filter((n) => n.selected).length;
  const hasColorable = nodes.some((n) => n.selected && COLORABLE.has(n.type ?? ""));
  const isEmpty = loaded && nodes.length === 0;

  return (
    <BoardContext.Provider value={actions}>
      <div
        className="board-backdrop relative h-screen w-screen"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={onDrop}
        onDoubleClick={onDoubleClick}
        onPointerMove={(e) => {
          mousePos.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDragStart={() => takeSnapshot()}
          onSelectionDragStart={() => takeSnapshot()}
          onNodesDelete={() => takeSnapshot()}
          onEdgesDelete={() => takeSnapshot()}
          onPaneClick={() => setSelected(null)}
          fitView
          minZoom={0.08}
          zoomOnDoubleClick={false}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          snapToGrid
          snapGrid={[12, 12]}
          colorMode="dark"
          style={{ background: "transparent" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1.5}
            color="rgba(71,85,105,0.35)"
          />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            position="top-right"
            pannable
            zoomable
            bgColor="rgba(13,18,32,0.8)"
            maskColor="rgba(6,9,18,0.7)"
            nodeColor="#334155"
          />
        </ReactFlow>

        {/* top bar */}
        <header className="glass absolute left-4 top-4 z-20 flex items-center gap-3 rounded-2xl px-5 py-2.5">
          <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-sm font-bold tracking-tight text-transparent">
            Miro-AI
          </span>
          <span className="text-xs text-slate-500">Visual thinking canvas</span>
        </header>

        {/* selection toolbar */}
        {selectionCount > 0 && (
          <div className="glass absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl px-3 py-2">
            {hasColorable && (
              <>
                {COLOR_NAMES.map((c) => (
                  <button
                    key={c}
                    onClick={() => applyColor(c)}
                    className={`h-4.5 w-4.5 rounded-full ${SWATCH_BG[c]} transition-transform hover:scale-125`}
                    title={c}
                  />
                ))}
                <div className="mx-1 h-5 w-px bg-white/10" />
              </>
            )}
            <button
              onClick={duplicateSelection}
              className="rounded-lg px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
              title="Duplicate (Ctrl+D)"
            >
              ⧉ Duplicate
            </button>
            <button
              onClick={deleteSelection}
              className="rounded-lg px-2.5 py-1 text-xs text-red-300/80 transition-colors hover:bg-red-400/10 hover:text-red-200"
              title="Delete (⌫)"
            >
              ✕ Delete
            </button>
            <span className="pl-1 text-[11px] text-slate-600">{selectionCount} selected</span>
          </div>
        )}

        {/* tool rail */}
        <div className="glass absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl px-2 py-2.5">
          <button
            onClick={() => fileInput.current?.click()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/90 to-violet-500/90 text-base font-semibold text-white transition-all hover:shadow-[0_0_24px_rgba(56,189,248,0.4)]"
            title="Add document (PDF)"
          >
            ＋
          </button>
          <div className="my-1 h-px w-6 bg-white/10" />
          <button
            onClick={() => addNodeAtCenter("text")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[15px] font-medium text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
            title="Text (T, or double-click the board)"
          >
            T
          </button>
          <button
            onClick={() => addNodeAtCenter("sticky")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[15px] text-amber-200/80 transition-colors hover:bg-amber-400/10 hover:text-amber-100"
            title="Sticky note (S)"
          >
            ▣
          </button>
          <button
            onClick={() => addNodeAtCenter("shape", "rect")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[15px] text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
            title="Rectangle (R)"
          >
            ▭
          </button>
          <button
            onClick={() => addNodeAtCenter("shape", "ellipse")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[15px] text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
            title="Ellipse (O)"
          >
            ◯
          </button>
          <button
            onClick={() => addNodeAtCenter("shape", "diamond")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[15px] text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
            title="Diamond (D)"
          >
            ◇
          </button>
          <div className="my-1 h-px w-6 bg-white/10" />
          <button
            onClick={() => addNodeAtCenter("code")}
            className="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-[13px] font-semibold text-emerald-300/90 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200"
            title="Python code block (C)"
          >
            {"</>"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={onPickFile}
          />
        </div>

        {/* AI command bar */}
        <div className="absolute bottom-6 left-1/2 z-20 w-[480px] -translate-x-1/2">
          {aiError && (
            <div className="glass mb-2 rounded-xl border-red-400/30 px-4 py-2 text-xs text-red-300">
              {aiError}
            </div>
          )}
          <div
            className={`glass flex items-center gap-2 rounded-2xl py-2 pl-4 pr-2 transition-shadow ${
              aiBusy ? "shadow-[0_0_32px_rgba(56,189,248,0.25)]" : ""
            }`}
          >
            <span className="text-base">✦</span>
            <input
              value={aiPrompt}
              onChange={(e) => {
                setAiPrompt(e.target.value);
                setAiError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && runAiPrompt()}
              disabled={aiBusy}
              placeholder="Ask AI anything — a table, a chart, an explanation…"
              className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600 disabled:opacity-60"
            />
            <button
              onClick={runAiPrompt}
              disabled={aiBusy || !aiPrompt.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-500/90 to-violet-500/90 px-4 py-1.5 text-[13px] font-semibold text-white transition-all hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] disabled:opacity-40 disabled:hover:shadow-none"
            >
              {aiBusy ? <span className="shimmer-text">Creating…</span> : "Generate"}
            </button>
          </div>
          {nodes.some((n) => n.selected && n.type === "knowledge") && (
            <div className="mt-1.5 text-center text-[11px] text-cyan-300/70">
              {nodes.filter((n) => n.selected && n.type === "knowledge").length}{" "}
              selected node(s) will be used as context
            </div>
          )}
        </div>

        {/* edge label editor */}
        {editingEdge && (
          <input
            autoFocus
            value={editingEdge.value}
            onChange={(e) =>
              setEditingEdge({ ...editingEdge, value: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdgeLabel();
              if (e.key === "Escape") setEditingEdge(null);
            }}
            onBlur={commitEdgeLabel}
            placeholder="Edge label…"
            className="glass absolute z-30 w-44 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 outline-none"
            style={{ left: editingEdge.x - 88, top: editingEdge.y - 16 }}
          />
        )}

        {/* empty state */}
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
            <div className="bg-gradient-to-r from-cyan-300 via-slate-100 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Drop a document. Watch it think.
            </div>
            <p className="mt-3 text-sm text-slate-500">
              PDFs become interactive maps — or double-click anywhere to start writing.
            </p>
          </div>
        )}

        {/* drag highlight */}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-30 rounded-3xl border-2 border-dashed border-cyan-400/60 bg-cyan-400/5" />
        )}

        {selected && (
          <NodePanel concept={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </BoardContext.Provider>
  );
}

export function Board() {
  return (
    <ReactFlowProvider>
      <BoardInner />
    </ReactFlowProvider>
  );
}
