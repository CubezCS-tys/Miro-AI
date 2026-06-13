"use client";

import { useCallback, useRef } from "react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 100;

/* Snapshot-based history. Reads go through the React Flow store (always
   current in controlled mode); writes go through the state setters so the
   controlled props stay the source of truth. */
export function useUndoRedo(
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
) {
  const { getNodes, getEdges } = useReactFlow();
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);

  const takeSnapshot = useCallback(() => {
    past.current.push({ nodes: getNodes(), edges: getEdges() });
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
  }, [getNodes, getEdges]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push({ nodes: getNodes(), edges: getEdges() });
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [getNodes, getEdges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ nodes: getNodes(), edges: getEdges() });
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [getNodes, getEdges, setNodes, setEdges]);

  return { takeSnapshot, undo, redo };
}
