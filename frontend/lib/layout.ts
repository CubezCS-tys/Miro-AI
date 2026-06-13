import ELK from "elkjs/lib/elk.bundled.js";
import type { KnowledgeGraph } from "./types";

const elk = new ELK();

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;

export async function computeLayout(
  graph: KnowledgeGraph,
): Promise<Record<string, { x: number; y: number }>> {
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
    },
    children: graph.nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: graph.edges.map((e, i) => ({
      id: `e${i}`,
      sources: [e.source],
      targets: [e.target],
    })),
  });

  const positions: Record<string, { x: number; y: number }> = {};
  for (const child of result.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return positions;
}
