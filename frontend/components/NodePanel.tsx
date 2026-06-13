"use client";

import { useMemo, useState } from "react";
import { getDocumentPage } from "@/lib/api";
import type { DocumentPage, GraphNode } from "@/lib/types";
import { CloseIcon } from "./icons";

const kindText: Record<string, string> = {
  concept: "text-citation",
  process: "text-success",
  entity: "text-warning",
  formula: "text-accent",
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
    <aside className="glass absolute right-3 top-16 bottom-3 z-20 w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-5 shadow-[var(--shadow-panel)] scroll-thin">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
            className="mt-1 w-full bg-transparent text-lg font-bold text-fg outline-none"
          />
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close panel"
        >
          <CloseIcon size={15} />
        </button>
      </div>

      <textarea
        value={concept.summary}
        onChange={(e) => onChange({ summary: e.target.value })}
        className="mb-6 min-h-24 w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed text-muted outline-none focus:border-accent"
      />

      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
            Source
          </div>
          <span
            className={`px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
              source?.verified
                ? "bg-fg text-bg"
                : "border border-dashed border-line text-muted"
            }`}
          >
            {source?.verified ? "verified" : "needs review"}
          </span>
        </div>
        <div className="mb-2 text-[11px] text-faint">{location}</div>
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-medium text-fg">
              {documentName ?? "Source document"}
            </div>
            <div className="text-[10px] text-faint">
              {documentId && page ? `Jump to page ${page}` : "No source link attached"}
            </div>
          </div>
          <button
            onClick={() => void openSource()}
            disabled={!documentId || !page || sourceBusy}
            className="shrink-0 border border-line px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:bg-fg hover:text-bg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg"
          >
            {sourceBusy ? "Loading" : "Open"}
          </button>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] text-faint">Page</span>
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
            className="w-20 rounded border border-line bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-accent"
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
          className="min-h-28 w-full resize-none border-l-2 border-line bg-transparent pl-3 text-[13px] italic leading-relaxed text-muted outline-none"
        />
        {sourceError && (
          <div className="mt-3 rounded-lg border border-contradiction/30 bg-contradiction/5 px-3 py-2 text-xs text-contradiction">
            {sourceError}
          </div>
        )}
        {excerpt && (
          <div className="mt-3 border border-line bg-surface-2 p-3">
            <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Page {sourcePage?.page} excerpt
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">
              {excerpt.prefix}
              {excerpt.match ? (
                <>
                  {excerpt.before}
                  <mark className="bg-highlight px-0.5 text-[color:var(--highlight-ink)]">
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
