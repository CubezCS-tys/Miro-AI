"use client";

import { useMemo, useState } from "react";
import { getDocumentPage } from "@/lib/api";
import type { DocumentPage, GraphNode } from "@/lib/types";

const kindText: Record<string, string> = {
  concept: "text-cyan-300",
  process: "text-emerald-300",
  entity: "text-amber-300",
  formula: "text-violet-300",
};

export function NodePanel({
  concept,
  documentId,
  documentName,
  onChange,
  onClose,
}: {
  concept: GraphNode;
  documentId?: string;
  documentName?: string;
  onChange: (patch: Partial<GraphNode>) => void;
  onClose: () => void;
}) {
  const [sourcePage, setSourcePage] = useState<DocumentPage | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const source = concept.source_span;
  const page = source?.page ?? concept.source_page;
  const location =
    source?.start_char != null && source.end_char != null
      ? `p${source.page}, chars ${source.start_char}-${source.end_char}`
      : page
        ? `p${page}`
        : "No page";
  const excerpt = useMemo(
    () => (sourcePage ? buildExcerpt(sourcePage.text, concept) : null),
    [sourcePage, concept],
  );

  const openSource = async () => {
    if (!documentId || !page || sourceBusy) return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      setSourcePage(await getDocumentPage(documentId, page));
    } catch (error) {
      setSourcePage(null);
      setSourceError(error instanceof Error ? error.message : "Could not load source");
    } finally {
      setSourceBusy(false);
    }
  };

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
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium text-slate-300">
              {documentName ?? "Source document"}
            </div>
            <div className="text-[10px] text-slate-600">
              {documentId && page ? `Jump to page ${page}` : "No source link attached"}
            </div>
          </div>
          <button
            onClick={() => void openSource()}
            disabled={!documentId || !page || sourceBusy}
            className="shrink-0 rounded-lg bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sourceBusy ? "Loading" : "Open"}
          </button>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Page</span>
          <input
            type="number"
            min={1}
            value={page ?? ""}
            onChange={(e) => {
              const nextPage = Number(e.target.value) || null;
              setSourcePage(null);
              onChange({
                source_page: Number(e.target.value) || null,
                source_span: source
                  ? {
                      ...source,
                      page: nextPage || source.page,
                      start_char: null,
                      end_char: null,
                      verified: false,
                    }
                  : null,
              });
            }}
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
        {sourceError && (
          <div className="mt-3 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-300">
            {sourceError}
          </div>
        )}
        {excerpt && (
          <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.03] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/70">
              Page {sourcePage?.page} excerpt
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
              {excerpt.prefix}
              {excerpt.match ? (
                <>
                  {excerpt.before}
                  <mark className="rounded bg-cyan-300/25 px-0.5 text-cyan-50">
                    {excerpt.match}
                  </mark>
                  {excerpt.after}
                </>
              ) : (
                <>
                  {excerpt.before}
                  {excerpt.after}
                </>
              )}
              {excerpt.suffix}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function buildExcerpt(pageText: string, concept: GraphNode) {
  const source = concept.source_span;
  let start =
    source?.start_char != null && source.end_char != null ? source.start_char : -1;
  let end = source?.end_char != null ? source.end_char : -1;
  if (start < 0 || end <= start || end > pageText.length) {
    start = concept.source_quote ? pageText.indexOf(concept.source_quote) : -1;
    end = start >= 0 ? start + concept.source_quote.length : -1;
  }
  if (start < 0 || end <= start) {
    const clipped = pageText.slice(0, 1200);
    return {
      prefix: "",
      before: clipped,
      match: "",
      after: pageText.length > clipped.length ? "..." : "",
      suffix: "",
    };
  }
  const contextStart = Math.max(0, start - 420);
  const contextEnd = Math.min(pageText.length, end + 420);
  return {
    prefix: contextStart > 0 ? "..." : "",
    before: pageText.slice(contextStart, start),
    match: pageText.slice(start, end),
    after: pageText.slice(end, contextEnd),
    suffix: contextEnd < pageText.length ? "..." : "",
  };
}
