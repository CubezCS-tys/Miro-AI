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
import { TerminalNode } from "./TerminalNode";
import { TableNode } from "./TableNode";
import { ChartNode } from "./ChartNode";
import { NoteNode } from "./NoteNode";
import { NodePanel } from "./NodePanel";
import { computeLayout } from "@/lib/layout";
import { BoardContext, type BoardActions } from "@/lib/board-context";
import { useUndoRedo } from "@/lib/use-undo-redo";
import { useTheme } from "@/lib/use-theme";
import { COLOR_NAMES, SWATCH_BG, type ColorName } from "@/lib/colors";
import {
  CloseIcon,
  CodeIcon,
  CommandIcon,
  ConceptIcon,
  CopyIcon,
  DiamondIcon,
  DocsIcon,
  EllipseIcon,
  FileUpIcon,
  LensIcon,
  MoonIcon,
  PlusIcon,
  RectIcon,
  SparkleIcon,
  StickyIcon,
  SunIcon,
  TextIcon,
  TrashIcon,
} from "./icons";
import {
  acceptFrontierProposal,
  analyzeDocument,
  createBoard,
  expandFrontier,
  generateArtifacts,
  getBoard,
  getCanvas,
  getConfig,
  getTutor,
  listBoards,
  listDocuments,
  rejectFrontierProposal,
  saveBoard,
  uploadDocument,
} from "@/lib/api";
import type {
  Artifact,
  BoardSummary,
  DocumentSummary,
  FrontierProposalResponse,
  GraphNode,
  RuntimeConfig,
  TutorResponse,
} from "@/lib/types";

const nodeTypes = {
  knowledge: KnowledgeNode,
  document: DocumentNode,
  text: TextNode,
  sticky: StickyNode,
  shape: ShapeNode,
  code: CodeNode,
  terminal: TerminalNode,
  table: TableNode,
  chart: ChartNode,
  note: NoteNode,
};

type BoardNode = Node;
type KnowledgeNodeData = {
  concept: GraphNode;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
};

type SelectedConcept = {
  nodeId: string;
  concept: GraphNode;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
};

interface Clipboard {
  nodes: BoardNode[];
  edges: Edge[];
}

let idCounter = 0;
const freshId = (kind: string) => `${kind}-${Date.now()}-${idCounter++}`;

const COLORABLE = new Set(["sticky", "shape"]);
type AddableNodeType = "text" | "sticky" | "shape" | "code" | "terminal";
type LensMode = "normal" | "argument" | "causal" | "timeline" | "proof" | "revision";

const NODE_CENTER_OFFSETS: Record<AddableNodeType, { x: number; y: number }> = {
  code: { x: 230, y: 190 },
  shape: { x: 100, y: 60 },
  sticky: { x: 100, y: 70 },
  terminal: { x: 280, y: 180 },
  text: { x: 100, y: 40 },
};

const frontierStroke: Record<string, string> = {
  supports: "var(--fg)",
  contradicts: "var(--fg)",
  context: "var(--muted)",
};
const EDGE_DEFAULT = "color-mix(in oklab, var(--muted) 55%, transparent)";
const EDGE_DOC = "color-mix(in oklab, var(--fg) 55%, transparent)";
const EDGE_LINK = "color-mix(in oklab, var(--muted) 70%, transparent)";

function BoardInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<SelectedConcept | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [tutor, setTutor] = useState<TutorResponse | null>(null);
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [frontierProposal, setFrontierProposal] =
    useState<FrontierProposalResponse | null>(null);
  const [frontierBusy, setFrontierBusy] = useState(false);
  const [frontierError, setFrontierError] = useState<string | null>(null);
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState("default");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [lensMode, setLensMode] = useState<LensMode>("normal");
  const [zoom, setZoom] = useState(1);
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
  const { theme, toggle: toggleTheme } = useTheme();
  const canvasColors = useMemo(
    () =>
      theme === "light"
        ? {
            dot: "rgba(0,0,0,0.13)",
            minimapBg: "rgba(255,255,255,0.82)",
            minimapMask: "rgba(0,0,0,0.06)",
            minimapNode: "#cbcbd1",
          }
        : {
            dot: "rgba(255,255,255,0.10)",
            minimapBg: "rgba(18,18,21,0.82)",
            minimapMask: "rgba(0,0,0,0.55)",
            minimapNode: "#3f3f46",
          },
    [theme],
  );

  useEffect(() => {
    void getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
    void listBoards()
      .then(({ boards }) => setBoards(boards))
      .catch(() => setBoards([]));
    void listDocuments()
      .then(({ documents }) => setDocuments(documents))
      .catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    getBoard(currentBoardId)
      .then((state) => {
        const restored = (state.nodes as BoardNode[]).map((n) => {
          if (n.type !== "document") return n;
          const meta = n.data as DocumentMeta;
          if (meta.status === "uploading")
            return { ...n, data: { ...meta, status: "error", error: "Interrupted - drop the file again" } };
          if (meta.status === "analyzing")
            return { ...n, data: { ...meta, status: "pending" } };
          return n;
        });
        setNodes(restored);
        setEdges(state.edges as Edge[]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [currentBoardId, setNodes, setEdges]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveBoard({ nodes, edges }, currentBoardId).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, loaded, currentBoardId]);

  const patchNode = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const patchKnowledgeNode = useCallback(
    (id: string, patch: Partial<GraphNode>) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id || n.type !== "knowledge") return n;
          const data = n.data as KnowledgeNodeData;
          return { ...n, data: { ...data, concept: { ...data.concept, ...patch } } };
        }),
      );
      setSelected((current) =>
        current?.nodeId === id
          ? { ...current, concept: { ...current.concept, ...patch } }
          : current,
      );
    },
    [setNodes],
  );

  const createNewBoard = useCallback(async () => {
    const title = `Board ${boards.length + 1}`;
    const board = await createBoard(title);
    setBoards((items) => [board, ...items]);
    setLoaded(false);
    setCurrentBoardId(board.id);
  }, [boards.length]);

  const selectedKnowledge = useCallback(
    () =>
      nodes
        .filter((n) => n.selected && n.type === "knowledge")
        .map((n) => (n.data as KnowledgeNodeData).concept),
    [nodes],
  );

  const selectedKnowledgeWithNodeIds = useCallback(
    () =>
      nodes
        .filter((n) => n.selected && n.type === "knowledge")
        .map((n) => ({
          ...(n.data as KnowledgeNodeData).concept,
          node_id: n.id,
        })),
    [nodes],
  );

  const exportSelected = useCallback(
    (format: "json" | "markdown" | "presentation") => {
      const concepts = selectedKnowledge();
      if (!concepts.length) return;
      const name = `miro-ai-selection-${Date.now()}`;
      const content =
        format === "json"
          ? JSON.stringify({ nodes: concepts }, null, 2)
          : concepts
              .map((concept) => {
                const source = concept.source_span;
                const page = source?.page ?? concept.source_page ?? "?";
                const citation = `p${page}`;
                const body = [
                  `# ${concept.label}`,
                  "",
                  concept.summary,
                  "",
                  `Source: ${citation}`,
                  "",
                  `> ${concept.source_quote}`,
                ].join("\n");
                return format === "presentation" ? `${body}\n\n---` : body;
              })
              .join("\n\n");
      const blob = new Blob([content], {
        type: format === "json" ? "application/json" : "text/markdown",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.${format === "json" ? "json" : "md"}`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [selectedKnowledge],
  );

  const openPresentation = useCallback(() => {
    const concepts = selectedKnowledge();
    if (!concepts.length) {
      setAiError("Select concept nodes before opening presentation mode.");
      return;
    }
    localStorage.setItem(
      "miro-ai-presentation",
      JSON.stringify({ createdAt: new Date().toISOString(), nodes: concepts }),
    );
    window.open("/present", "_blank", "noopener,noreferrer");
  }, [selectedKnowledge]);

  const openArena = useCallback(() => {
    const concepts = selectedKnowledgeWithNodeIds();
    if (!concepts.length) {
      setAiError("Select concept nodes before opening Tutor Arena.");
      return;
    }
    localStorage.setItem(
      "miro-ai-arena",
      JSON.stringify({
        createdAt: new Date().toISOString(),
        board_id: currentBoardId,
        selected_nodes: concepts,
      }),
    );
    window.open("/arena", "_blank", "noopener,noreferrer");
  }, [currentBoardId, selectedKnowledgeWithNodeIds]);

  const runFrontier = useCallback(async () => {
    const selection = selectedKnowledgeWithNodeIds();
    if (!selection.length || frontierBusy) {
      setFrontierError("Select concept nodes before expanding the frontier.");
      return;
    }
    setFrontierBusy(true);
    setFrontierError(null);
    try {
      const query = selection.map((concept) => concept.label).join(", ");
      const response = await expandFrontier({
        board_id: currentBoardId,
        query,
        selection,
        source_types: ["mock"],
        budget: "cheap",
      });
      setFrontierProposal(response);
    } catch (e) {
      setFrontierError(e instanceof Error ? e.message : "Frontier expansion failed");
    } finally {
      setFrontierBusy(false);
    }
  }, [currentBoardId, frontierBusy, selectedKnowledgeWithNodeIds]);

  const acceptFrontier = useCallback(async () => {
    if (!frontierProposal) return;
    try {
      const response = await acceptFrontierProposal(frontierProposal.proposal_id);
      const proposal = response.proposal;
      const prefix = response.proposal_id.slice(0, 8);
      const selectedNodes = nodes.filter((n) => n.selected && n.type === "knowledge");
      const center = selectedNodes.length
        ? selectedNodes.reduce(
            (acc, node) => ({
              x: acc.x + node.position.x / selectedNodes.length,
              y: acc.y + node.position.y / selectedNodes.length,
            }),
            { x: 0, y: 0 },
          )
        : screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
      const idMap = new Map(
        proposal.nodes.map((node) => [node.id, `${prefix}-${node.id}`]),
      );
      const sourceName = proposal.sources[0]?.title ?? "Mock research source";
      takeSnapshot();
      setNodes((current) => [
        ...current,
        ...proposal.nodes.map((concept, index) => ({
          id: idMap.get(concept.id) ?? `${prefix}-${concept.id}`,
          type: "knowledge",
          position: {
            x: center.x + 360,
            y: center.y - 150 + index * 150,
          },
          data: {
            concept,
            sourceDocumentName: sourceName,
          },
        })),
      ]);
      setEdges((current) => [
        ...current,
        ...proposal.edges.map((edge, index) => {
          const kind = edge.kind ?? edge.label;
          return {
            id: `${prefix}-frontier-edge-${index}`,
            source: idMap.get(edge.source) ?? edge.source,
            target: idMap.get(edge.target) ?? edge.target,
            label: edge.label,
            data: { kind },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: frontierStroke[kind] ?? EDGE_DEFAULT,
            },
            style: {
              stroke: frontierStroke[kind] ?? EDGE_DEFAULT,
              strokeWidth: kind === "contradicts" ? 2.25 : 1.75,
              strokeDasharray: kind === "contradicts" ? "6 4" : undefined,
            },
          };
        }),
      ]);
      setFrontierProposal(null);
      setTimeout(() => fitView({ duration: 600, padding: 0.15 }), 50);
    } catch (e) {
      setFrontierError(e instanceof Error ? e.message : "Could not accept proposal");
    }
  }, [
    fitView,
    frontierProposal,
    nodes,
    screenToFlowPosition,
    setEdges,
    setNodes,
    takeSnapshot,
  ]);

  const rejectFrontier = useCallback(async () => {
    if (!frontierProposal) return;
    try {
      await rejectFrontierProposal(frontierProposal.proposal_id);
      setFrontierProposal(null);
    } catch (e) {
      setFrontierError(e instanceof Error ? e.message : "Could not reject proposal");
    }
  }, [frontierProposal]);

  const runTutor = useCallback(async () => {
    const concepts = selectedKnowledge();
    if (!concepts.length || tutorBusy) {
      setTutorError("Select grounded concept nodes first.");
      return;
    }
    setTutorBusy(true);
    setTutorError(null);
    try {
      const result = await getTutor(
        concepts.map((concept) => ({
          label: concept.label,
          summary: concept.summary,
          source_quote: concept.source_quote,
          source_page: concept.source_page,
          source_span: concept.source_span,
        })),
      );
      setTutor(result);
    } catch (e) {
      setTutorError(e instanceof Error ? e.message : "Tutor failed");
    } finally {
      setTutorBusy(false);
    }
  }, [selectedKnowledge, tutorBusy]);

  const createChartFromSelectedTable = useCallback(() => {
    const tableNode = nodes.find((n) => n.selected && n.type === "table");
    const artifact = (tableNode?.data as { artifact?: Artifact } | undefined)?.artifact;
    const table = artifact?.table;
    if (!tableNode || !artifact || !table?.headers.length || !table.rows.length) {
      setAiError("Select a table with at least one numeric column.");
      return;
    }
    const labelHeader = table.headers[0] ?? "Item";
    const numericColumn = table.headers.findIndex((_, columnIndex) => {
      if (columnIndex === 0) return false;
      return table.rows.some((row) => Number.isFinite(Number(row[columnIndex])));
    });
    if (numericColumn < 1) {
      setAiError("Selected table has no numeric column to chart.");
      return;
    }
    const points = table.rows
      .map((row, index) => ({
        label: row[0] || `Row ${index + 1}`,
        value: Number(row[numericColumn]),
      }))
      .filter((point) => Number.isFinite(point.value));
    if (!points.length) {
      setAiError("Selected table has no numeric values to chart.");
      return;
    }
    takeSnapshot();
    const chartId = freshId("chart");
    const chartArtifact: Artifact = {
      kind: "chart",
      title: `${artifact.title} chart`,
      table: { headers: [], rows: [] },
      chart: {
        type: "bar",
        x_label: labelHeader,
        y_label: table.headers[numericColumn] ?? "Value",
        series: [{ name: table.headers[numericColumn] ?? "Value", points }],
      },
      note: { body: "" },
    };
    setNodes((ns) => [
      ...ns,
      {
        id: chartId,
        type: "chart",
        position: {
          x: tableNode.position.x + 420,
          y: tableNode.position.y,
        },
        data: { artifact: chartArtifact },
        selected: true,
      },
    ]);
    setEdges((es) => [
      ...es,
      {
        id: freshId("edge"),
        source: tableNode.id,
        target: chartId,
        label: "visualizes",
        style: { stroke: EDGE_LINK, strokeWidth: 1.5 },
      },
    ]);
  }, [nodes, takeSnapshot, setNodes, setEdges]);

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

  const addNodeAt = useCallback(
    (
      type: AddableNodeType,
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
              : type === "terminal"
                ? {
                    id: freshId(type),
                    type,
                    position,
                    data: { title: "Terminal", runtime: "host" },
                    style: { width: 560, height: 360 },
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
    (type: AddableNodeType, shape: ShapeKind = "rect") => {
      addNodeAt(type, screenToFlowPosition(mousePos.current), shape);
    },
    [addNodeAt, screenToFlowPosition],
  );

  const addNodeAtCenter = useCallback(
    (type: AddableNodeType, shape: ShapeKind = "rect") => {
      const offset = NODE_CENTER_OFFSETS[type];
      addNodeAt(
        type,
        screenToFlowPosition({
          x: window.innerWidth / 2 - offset.x,
          y: window.innerHeight / 2 - offset.y,
        }),
        shape,
      );
    },
    [addNodeAt, screenToFlowPosition],
  );

  const addKnowledgeAtCenter = useCallback(() => {
    takeSnapshot();
    const concept: GraphNode = {
      id: freshId("manual-concept"),
      label: "New concept",
      summary: "Add the explanation here.",
      source_quote: "",
      source_page: null,
      source_span: null,
      kind: "concept",
    };
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      {
        id: freshId("knowledge"),
        type: "knowledge",
        position: screenToFlowPosition({
          x: window.innerWidth / 2 - 100,
          y: window.innerHeight / 2 - 60,
        }),
        data: { concept },
        selected: true,
      },
    ]);
  }, [takeSnapshot, setNodes, screenToFlowPosition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && k === "z" && !e.shiftKey) {
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
        else if (k === "b") addAtCursor("terminal");
        else if (k === "k") addKnowledgeAtCenter();
        else if (k === "escape") {
          setSelected(null);
          setEditingEdge(null);
          setPaletteOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    copySelection,
    paste,
    duplicateSelection,
    addAtCursor,
    addKnowledgeAtCenter,
    setNodes,
  ]);

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
        const uploaded = await uploadDocument(file);
        patchNode(docNodeId, {
          status: "pending",
          documentId: uploaded.document_id,
          pageCount: uploaded.page_count,
        });
        void listDocuments()
          .then(({ documents }) => setDocuments(documents))
          .catch(() => {});
      } catch (e) {
        patchNode(docNodeId, {
          status: "error",
          error: e instanceof Error ? e.message : "Upload failed",
        });
      }
    },
    [takeSnapshot, setNodes, patchNode],
  );

  const generateFromDocument = useCallback(
    async (docNodeId: string, intent: string | null) => {
      const docNode = getNode(docNodeId);
      const documentId = (docNode?.data as DocumentMeta | undefined)?.documentId;
      if (!docNode || !documentId) return;
      const position = docNode.position;
      patchNode(docNodeId, { status: "analyzing" });

      try {
        const { canvas_id } = await analyzeDocument(
          documentId,
          intent,
          currentBoardId,
        );
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
          data: {
            concept,
            sourceDocumentId: canvas.document_id,
            sourceDocumentName: (docNode.data as DocumentMeta).filename,
          },
        }));

        const hasIncoming = new Set(canvas.graph.edges.map((e) => e.target));
        const roots = canvas.graph.nodes.filter((n) => !hasIncoming.has(n.id));

        const newEdges: Edge[] = [
          ...canvas.graph.edges.map((e, i) => ({
            id: `${prefix}-e${i}`,
            source: `${prefix}-${e.source}`,
            target: `${prefix}-${e.target}`,
            label: e.label,
            style: { stroke: EDGE_DEFAULT },
          })),
          ...roots.map((r) => ({
            id: `${prefix}-root-${r.id}`,
            source: docNodeId,
            target: `${prefix}-${r.id}`,
            animated: true,
            style: { stroke: EDGE_DOC },
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
    [getNode, patchNode, takeSnapshot, setNodes, setEdges, fitView, currentBoardId],
  );

  const actions = useMemo<BoardActions>(
    () => ({ updateNodeData: patchNode, generateFromDocument }),
    [patchNode, generateFromDocument],
  );

  const runPrompt = useCallback(async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || aiBusy) return;
    if (config && prompt.length > config.max_prompt_chars) {
      setAiError(`Prompt is too long. Limit is ${config.max_prompt_chars} characters.`);
      return;
    }
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
          const c = (n.data as KnowledgeNodeData).concept;
          const source = c.source_span;
          return {
            label: c.label,
            summary: c.summary,
            source_page: source?.page ?? c.source_page,
            source_quote: c.source_quote,
          };
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
  }, [aiBusy, config, nodes, takeSnapshot, screenToFlowPosition, setNodes, fitView]);

  const runAiPrompt = useCallback(() => {
    void runPrompt(aiPrompt);
  }, [aiPrompt, runPrompt]);

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
            markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_DEFAULT },
            style: { stroke: EDGE_DEFAULT, strokeWidth: 1.5 },
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
      const data = node.data as KnowledgeNodeData;
      setSelected({
        nodeId: node.id,
        concept: data.concept,
        sourceDocumentId: data.sourceDocumentId,
        sourceDocumentName: data.sourceDocumentName,
      });
    }
  }, []);

  const selectionCount = nodes.filter((n) => n.selected).length;
  const hasColorable = nodes.some((n) => n.selected && COLORABLE.has(n.type ?? ""));
  const isEmpty = loaded && nodes.length === 0;
  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        if (lensMode === "normal") return edge;
        const label = String(edge.label ?? "").toLowerCase();
        const matches =
          (lensMode === "causal" &&
            /cause|drive|lead|result|produce|trigger/.test(label)) ||
          (lensMode === "argument" &&
            /claim|support|evidence|counter|argue|prove/.test(label)) ||
          (lensMode === "proof" && /prove|derive|imply|therefore|lemma/.test(label)) ||
          (lensMode === "timeline" &&
            /before|after|then|next|follow|precede/.test(label)) ||
          (lensMode === "revision" &&
            /revise|replace|update|contradict|correct/.test(label));
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: matches ? 1 : 0.25,
            stroke: matches
              ? "var(--accent)"
              : "color-mix(in oklab, var(--muted) 40%, transparent)",
            strokeWidth: matches ? 2.25 : 1,
          },
        };
      }),
    [edges, lensMode],
  );

  return (
    <BoardContext.Provider value={actions}>
      <div
        className={`board-backdrop board-zoom-${
          zoom < 0.35 ? "overview" : "detail"
        } relative h-screen w-screen`}
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
          edges={displayEdges}
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
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          fitView
          minZoom={0.08}
          zoomOnDoubleClick={false}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          snapToGrid
          snapGrid={[12, 12]}
          colorMode={theme}
          style={{ background: "transparent" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.4}
            color={canvasColors.dot}
          />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            position="top-right"
            pannable
            zoomable
            bgColor={canvasColors.minimapBg}
            maskColor={canvasColors.minimapMask}
            nodeColor={canvasColors.minimapNode}
          />
        </ReactFlow>

        <header className="glass absolute left-3 top-3 z-20 flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 overflow-x-auto rounded-xl px-2.5 py-1.5 text-fg scroll-thin">
          <span className="shrink-0 whitespace-nowrap px-1 text-[15px] font-bold tracking-tight text-fg">
            Miro-AI
          </span>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-line-strong" />
          <select
            value={currentBoardId}
            onChange={(e) => {
              setLoaded(false);
              setCurrentBoardId(e.target.value);
            }}
            className="max-w-[7.5rem] shrink-0 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-fg outline-none focus:border-accent"
            title="Board"
          >
            {boards.length ? (
              boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.title}
                </option>
              ))
            ) : (
              <option value="default">Default board</option>
            )}
          </select>
          <button
            onClick={() => void createNewBoard()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="New board"
            aria-label="New board"
          >
            <PlusIcon />
          </button>
          <button
            onClick={() => setLibraryOpen((open) => !open)}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-fg ${
              libraryOpen ? "bg-surface-2 text-fg" : "text-muted"
            }`}
            title="Document library"
            aria-label="Document library"
          >
            <DocsIcon />
          </button>
          <a
            href="/settings"
            target="_blank"
            rel="noreferrer"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Settings"
            aria-label="Settings"
          >
            <CommandIcon size={14} />
          </a>
          <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-line-strong sm:block" />
          <span className="hidden shrink-0 items-center gap-1 text-muted sm:flex">
            <LensIcon size={14} className="shrink-0" />
            <select
              value={lensMode}
              onChange={(e) => setLensMode(e.target.value as LensMode)}
              className="rounded-lg border border-line bg-surface-2 px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
              title="Lens mode"
            >
              <option value="normal">Normal</option>
              <option value="argument">Argument</option>
              <option value="causal">Causal</option>
              <option value="proof">Proof</option>
              <option value="timeline">Timeline</option>
              <option value="revision">Revision</option>
            </select>
          </span>
          <span className="ml-1 hidden shrink-0 truncate text-[11px] text-faint lg:inline">
            {documents.length} docs · {config?.provider ?? "provider"} ·{" "}
            {zoom < 0.35 ? "overview" : "detail"}
          </span>
          <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-line-strong sm:block" />
          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Command palette (Ctrl/Cmd+K)"
            aria-label="Open command palette"
          >
            <CommandIcon size={14} />
            <span className="hidden text-[11px] font-medium sm:inline">K</span>
          </button>
        </header>

        {selectionCount > 0 && (
          <div className="glass absolute bottom-[5.5rem] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl px-2 py-1.5 text-fg sm:bottom-auto sm:top-3">
            {hasColorable && (
              <>
                {COLOR_NAMES.map((c) => (
                  <button
                    key={c}
                    onClick={() => applyColor(c)}
                    className={`h-4 w-4 rounded-full ring-1 ring-line-strong ${SWATCH_BG[c]} transition-transform hover:scale-125`}
                    title={c}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <span className="mx-0.5 h-5 w-px bg-line-strong" />
              </>
            )}
            <button
              onClick={duplicateSelection}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              title="Duplicate (Ctrl+D)"
            >
              <CopyIcon size={14} />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
            <button
              onClick={deleteSelection}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-contradiction/10 hover:text-contradiction"
              title="Delete (Backspace)"
            >
              <TrashIcon size={14} />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <span className="px-1 text-[11px] text-faint">{selectionCount}</span>
          </div>
        )}

        <div className="glass absolute left-3 top-1/2 z-20 flex max-h-[calc(100vh-1.5rem)] -translate-y-1/2 flex-col items-center gap-0.5 overflow-y-auto rounded-xl px-1.5 py-2 scroll-thin">
          <button
            onClick={() => fileInput.current?.click()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg transition-transform hover:scale-105"
            title="Add document (PDF)"
            aria-label="Add document"
          >
            <FileUpIcon size={18} />
          </button>
          <span className="my-1 h-px w-5 bg-line-strong" />
          <button
            onClick={() => addNodeAtCenter("text")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Text (T, or double-click the board)"
            aria-label="Add text"
          >
            <TextIcon size={18} />
          </button>
          <button
            onClick={addKnowledgeAtCenter}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-citation/12 hover:text-citation"
            title="Concept node (K)"
            aria-label="Add concept node"
          >
            <ConceptIcon size={18} />
          </button>
          <button
            onClick={() => addNodeAtCenter("sticky")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-warning/12 hover:text-warning"
            title="Sticky note (S)"
            aria-label="Add sticky note"
          >
            <StickyIcon size={18} />
          </button>
          <button
            onClick={() => addNodeAtCenter("shape", "rect")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Rectangle (R)"
            aria-label="Add rectangle"
          >
            <RectIcon size={18} />
          </button>
          <button
            onClick={() => addNodeAtCenter("shape", "ellipse")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Ellipse (O)"
            aria-label="Add ellipse"
          >
            <EllipseIcon size={18} />
          </button>
          <button
            onClick={() => addNodeAtCenter("shape", "diamond")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Diamond (D)"
            aria-label="Add diamond"
          >
            <DiamondIcon size={18} />
          </button>
          <span className="my-1 h-px w-5 bg-line-strong" />
          <button
            onClick={() => addNodeAtCenter("code")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-success/12 hover:text-success"
            title="Python code block (C)"
            aria-label="Add Python code block"
          >
            <CodeIcon size={18} />
          </button>
          <button
            onClick={() => addNodeAtCenter("terminal")}
            className="flex h-9 w-9 items-center justify-center rounded-lg font-mono text-[15px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            title="Host terminal (B)"
            aria-label="Add host terminal"
          >
            $
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={onPickFile}
          />
        </div>

        <div className="absolute bottom-4 left-1/2 z-20 w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2">
          {aiError && (
            <div className="glass mb-2 rounded-xl border-contradiction/40 px-4 py-2 text-xs text-contradiction">
              {aiError}
            </div>
          )}
          <div
            className="glass flex items-center gap-2 py-1.5 pl-3 pr-1.5 shadow-[var(--shadow-panel)]"
          >
            <SparkleIcon size={16} className="shrink-0 text-accent" />
            <input
              value={aiPrompt}
              onChange={(e) => {
                setAiPrompt(e.target.value);
                setAiError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && runAiPrompt()}
              disabled={aiBusy}
              maxLength={config?.max_prompt_chars}
              placeholder="Ask AI anything: table, chart, explanation"
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint disabled:opacity-60"
            />
            <button
              onClick={runAiPrompt}
              disabled={aiBusy || !aiPrompt.trim()}
              className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {aiBusy ? <span className="shimmer-text">Creating...</span> : "Generate"}
            </button>
          </div>
          {nodes.some((n) => n.selected && n.type === "knowledge") && (
            <div className="mt-1.5 text-center text-[11px] text-citation">
              {nodes.filter((n) => n.selected && n.type === "knowledge").length}{" "}
              selected node(s) will be used as context
            </div>
          )}
        </div>

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
            placeholder="Edge label..."
            className="glass absolute z-30 w-44 rounded-lg px-2.5 py-1.5 text-xs text-fg outline-none placeholder:text-faint focus:border-accent"
            style={{ left: editingEdge.x - 88, top: editingEdge.y - 16 }}
          />
        )}

        {paletteOpen && (
          <div
            className="absolute inset-0 z-40 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
            onClick={() => setPaletteOpen(false)}
          >
            <div
              className="glass w-[520px] max-w-full rounded-2xl p-2.5 shadow-[var(--shadow-panel)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-2 pb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-faint">
                  <CommandIcon size={13} />
                  Command palette
                </span>
                <button
                  onClick={() => setPaletteOpen(false)}
                  className="rounded-lg p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                  aria-label="Close command palette"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
              <div className="grid gap-0.5 pt-1.5">
                {[
                  {
                    label: "Summarize selected cluster",
                    action: () => runPrompt("Summarize the selected cluster with citations."),
                  },
                  {
                    label: "Tutor selected region",
                    action: runTutor,
                  },
                  {
                    label: "Open Tutor Arena",
                    action: openArena,
                  },
                  {
                    label: "Expand frontier",
                    action: runFrontier,
                  },
                  {
                    label: "Argument lens",
                    action: () => setLensMode("argument"),
                  },
                  {
                    label: "Causal lens",
                    action: () => setLensMode("causal"),
                  },
                  {
                    label: "Add manual concept",
                    action: addKnowledgeAtCenter,
                  },
                  {
                    label: "Add host terminal",
                    action: () => addNodeAtCenter("terminal"),
                  },
                  {
                    label: "Create linked chart from selected table",
                    action: createChartFromSelectedTable,
                  },
                  {
                    label: "Export selected graph as Markdown",
                    action: () => exportSelected("markdown"),
                  },
                  {
                    label: "Export selected graph as JSON",
                    action: () => exportSelected("json"),
                  },
                  {
                    label: "Export selected graph as presentation Markdown",
                    action: () => exportSelected("presentation"),
                  },
                  {
                    label: "Open selected graph as presentation",
                    action: openPresentation,
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      item.action();
                      setPaletteOpen(false);
                    }}
                    className="rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-accent hover:text-accent-fg"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {(frontierProposal || frontierBusy || frontierError) && (
          <aside className="glass absolute left-3 right-3 top-16 z-30 rounded-2xl p-4 shadow-[var(--shadow-panel)] sm:left-20 sm:right-auto sm:w-[440px] sm:max-w-[calc(100vw-6rem)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-citation">
                  Research frontier
                </div>
                {frontierProposal && (
                  <div className="mt-1 truncate text-[11px] text-faint">
                    {frontierProposal.proposal.query}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setFrontierProposal(null);
                  setFrontierError(null);
                }}
                className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Close research frontier"
              >
                <CloseIcon size={14} />
              </button>
            </div>
            {frontierBusy && (
              <div className="shimmer-text text-sm">Expanding cited frontier...</div>
            )}
            {frontierError && (
              <div className="rounded-xl border border-contradiction/30 bg-contradiction/5 px-3 py-2 text-sm text-contradiction">
                {frontierError}
              </div>
            )}
            {frontierProposal && !frontierBusy && (
              <div className="space-y-3">
                <div className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Source ledger
                  </div>
                  {frontierProposal.proposal.sources.map((source) => (
                    <div key={source.id} className="text-sm text-fg">
                      {source.title}
                      <div className="mt-1 text-[11px] text-faint">
                        {source.kind} · {source.sha256?.slice(0, 12)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto scroll-thin">
                  {frontierProposal.proposal.nodes.map((node) => {
                    const claim = frontierProposal.proposal.claims.find(
                      (item) => item.quote === node.source_quote,
                    );
                    const stance = claim?.stance ?? "context";
                    const stanceClass =
                      stance === "supports"
                        ? "bg-success/12 text-success"
                        : stance === "contradicts"
                          ? "bg-contradiction/12 text-contradiction"
                          : "bg-citation/12 text-citation";
                    return (
                      <div
                        key={node.id}
                        className="rounded-xl border border-line bg-surface-2 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-fg">
                            {node.label}
                          </div>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${stanceClass}`}
                          >
                            {stance}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          {node.summary}
                        </p>
                        <div className="mt-2 border-l-2 border-citation/50 pl-2 text-[11px] italic leading-relaxed text-faint">
                          {node.source_quote}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => void rejectFrontier()}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => void acceptFrontier()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
                  >
                    Accept nodes
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}

        {libraryOpen && (
          <aside className="glass absolute left-3 top-16 z-30 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-4 shadow-[var(--shadow-panel)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-faint">
                <DocsIcon size={13} />
                Documents
              </div>
              <button
                onClick={() => setLibraryOpen(false)}
                className="rounded-lg p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Close documents"
              >
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto scroll-thin">
              {documents.length ? (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-line bg-surface-2 px-3 py-2"
                  >
                    <div className="truncate text-sm font-medium text-fg">
                      {doc.filename}
                    </div>
                    <div className="mt-1 text-[11px] text-faint">
                      {doc.page_count} pages · {Math.ceil(doc.size_bytes / 1024)} KB
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-6 text-center text-sm text-faint">
                  No uploaded documents yet.
                </div>
              )}
            </div>
          </aside>
        )}

        {(tutor || tutorBusy || tutorError) && (
          <aside className="glass absolute bottom-24 right-3 z-30 w-[min(420px,calc(100vw-1.5rem))] rounded-2xl p-4 shadow-[var(--shadow-panel)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-success">
                Tutor
              </div>
              <button
                onClick={() => {
                  setTutor(null);
                  setTutorError(null);
                }}
                className="rounded-lg p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Close tutor"
              >
                <CloseIcon size={14} />
              </button>
            </div>
            {tutorBusy && <div className="shimmer-text text-sm">Building questions...</div>}
            {tutorError && (
              <div className="rounded-xl border border-contradiction/30 bg-contradiction/5 px-3 py-2 text-sm text-contradiction">
                {tutorError}
              </div>
            )}
            {tutor && !tutorBusy && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-fg">{tutor.title}</h3>
                <div className="space-y-2">
                  {tutor.questions.map((question, index) => (
                    <div
                      key={`${question.question}-${index}`}
                      className="rounded-xl border border-line bg-surface-2 p-3"
                    >
                      <div className="text-sm font-medium leading-snug text-fg">
                        {question.question}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-muted">
                        {question.why}
                      </div>
                      <div className="mt-2 flex items-start gap-2 text-[11px] text-faint">
                        <span className="rounded bg-citation/12 px-1.5 py-0.5 font-semibold text-citation">
                          p{question.source_page ?? "?"}
                        </span>
                        <span className="line-clamp-2 italic">
                          {question.source_quote}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {tutor.weak_links.length > 0 && (
                  <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">
                      Weak links
                    </div>
                    <ul className="space-y-1 text-xs text-warning">
                      {tutor.weak_links.map((link, index) => (
                        <li key={`${link}-${index}`}>{link}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
            <div className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Drop a document. Watch it think.
            </div>
            <p className="mt-3 max-w-md text-sm text-muted">
              PDFs stay in this local backend, then go to the configured AI provider only when you generate a map.
            </p>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-30 rounded-3xl border-2 border-dashed border-accent/60 bg-accent/5" />
        )}

        {selected && (
          <NodePanel
            concept={selected.concept}
            documentId={selected.sourceDocumentId}
            documentName={selected.sourceDocumentName}
            onChange={(patch) => patchKnowledgeNode(selected.nodeId, patch)}
            onClose={() => setSelected(null)}
          />
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
