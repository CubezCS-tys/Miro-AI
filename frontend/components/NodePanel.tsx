"use client";

import type { GraphNode } from "@/lib/types";

const kindText: Record<string, string> = {
  concept: "text-cyan-300",
  process: "text-emerald-300",
  entity: "text-amber-300",
  formula: "text-violet-300",
};

export function NodePanel({
  concept,
  onClose,
}: {
  concept: GraphNode;
  onClose: () => void;
}) {
  return (
    <aside className="glass absolute right-4 top-20 bottom-4 z-20 w-96 overflow-y-auto rounded-2xl p-6 shadow-[0_8px_48px_rgba(0,0,0,0.5)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div
            className={`text-[10px] font-medium uppercase tracking-[0.16em] ${
              kindText[concept.kind] ?? kindText.concept
            }`}
          >
            {concept.kind}
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-50">
            {concept.label}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-slate-300">
        {concept.summary}
      </p>

      <div className="rounded-xl border border-white/8 bg-black/30 p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          From the document
        </div>
        <blockquote className="border-l-2 border-cyan-400/40 pl-3 text-[13px] italic leading-relaxed text-slate-400">
          “{concept.source_quote}”
        </blockquote>
      </div>
    </aside>
  );
}
