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
  onChange,
  onClose,
}: {
  concept: GraphNode;
  onChange: (patch: Partial<GraphNode>) => void;
  onClose: () => void;
}) {
  const source = concept.source_span;
  const page = source?.page ?? concept.source_page;
  const location =
    source?.start_char != null && source.end_char != null
      ? `p${source.page}, chars ${source.start_char}-${source.end_char}`
      : page
        ? `p${page}`
        : "No page";

  return (
    <aside className="glass absolute right-4 top-20 bottom-4 z-20 w-96 overflow-y-auto rounded-2xl p-6 shadow-[0_8px_48px_rgba(0,0,0,0.5)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <select
            value={concept.kind}
            onChange={(e) =>
              onChange({ kind: e.target.value as GraphNode["kind"] })
            }
            className={`bg-transparent text-[10px] font-medium uppercase tracking-[0.16em] outline-none ${
              kindText[concept.kind] ?? kindText.concept
            }`}
          >
            <option value="concept">concept</option>
            <option value="process">process</option>
            <option value="entity">entity</option>
            <option value="formula">formula</option>
          </select>
          <input
            value={concept.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="mt-1 w-full bg-transparent text-lg font-bold text-slate-50 outline-none"
          />
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <textarea
        value={concept.summary}
        onChange={(e) => onChange({ summary: e.target.value })}
        className="mb-6 min-h-24 w-full resize-none rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-sm leading-relaxed text-slate-300 outline-none focus:border-cyan-400/30"
      />

      <div className="rounded-xl border border-white/8 bg-black/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Source
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
              source?.verified
                ? "bg-cyan-400/12 text-cyan-200"
                : "bg-amber-400/12 text-amber-200"
            }`}
          >
            {source?.verified ? "verified" : "needs review"}
          </span>
        </div>
        <div className="mb-2 text-[11px] text-slate-500">{location}</div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Page</span>
          <input
            type="number"
            min={1}
            value={page ?? ""}
            onChange={(e) =>
              onChange({
                source_page: Number(e.target.value) || null,
                source_span: source
                  ? { ...source, page: Number(e.target.value) || source.page }
                  : null,
              })
            }
            className="w-20 rounded border border-white/8 bg-black/20 px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-400/30"
          />
        </div>
        <textarea
          value={concept.source_quote}
          onChange={(e) =>
            onChange({
              source_quote: e.target.value,
              source_span: source
                ? { ...source, quote: e.target.value, verified: false }
                : null,
            })
          }
          className="min-h-28 w-full resize-none border-l-2 border-cyan-400/40 bg-transparent pl-3 text-[13px] italic leading-relaxed text-slate-400 outline-none"
        />
      </div>
    </aside>
  );
}
