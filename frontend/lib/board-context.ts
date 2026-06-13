"use client";

import { createContext, useContext } from "react";

/* Node components can't hold callbacks in node.data (the board is persisted
   as JSON), so they reach the board's actions through this context. */
export interface BoardActions {
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  generateFromDocument: (nodeId: string, intent: string | null) => void;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoardActions(): BoardActions {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoardActions must be used inside Board");
  return ctx;
}
