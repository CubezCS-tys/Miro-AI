"use client";

import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "@/lib/types";

interface Deck {
  createdAt: string;
  nodes: GraphNode[];
}

export default function PresentPage() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = localStorage.getItem("miro-ai-presentation");
      if (!raw) return;
      try {
        setDeck(JSON.parse(raw) as Deck);
      } catch {
        setDeck(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const slide = deck?.nodes[index] ?? null;
  const source = slide?.source_span;
  const page = source?.page ?? slide?.source_page;
  const canPrev = index > 0;
  const canNext = deck ? index < deck.nodes.length - 1 : false;
  const progress = useMemo(() => {
    if (!deck?.nodes.length) return "0 / 0";
    return `${index + 1} / ${deck.nodes.length}`;
  }, [deck, index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && canNext) setIndex((value) => value + 1);
      if (event.key === "ArrowLeft" && canPrev) setIndex((value) => value - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, canPrev]);

  if (!slide) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-muted">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold text-fg">No presentation loaded</h1>
          <p className="mt-2 text-sm text-faint">
            Select grounded concept nodes on the board, then open presentation mode.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-fg">
      <header className="glass fixed left-0 right-0 top-0 z-10 flex items-center justify-between border-x-0 border-t-0 px-6 py-4">
        <div className="text-sm font-semibold text-fg">Miro-AI presentation</div>
        <div className="text-xs text-faint">{progress}</div>
      </header>

      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-24 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded bg-citation/12 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-citation">
            {slide.kind}
          </span>
          <span className="rounded bg-surface-2 px-2 py-1 text-xs font-semibold text-muted">
            p{page ?? "?"}
          </span>
          {source?.verified === false && (
            <span className="rounded bg-warning/12 px-2 py-1 text-xs font-semibold text-warning">
              needs review
            </span>
          )}
        </div>
        <h1 className="max-w-4xl text-4xl font-bold leading-tight text-fg sm:text-5xl">
          {slide.label}
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted sm:text-xl">
          {slide.summary}
        </p>
        <blockquote className="mt-10 max-w-3xl border-l-2 border-citation/50 pl-5 text-base italic leading-relaxed text-muted">
          {slide.source_quote || "No source quote attached."}
        </blockquote>
      </section>

      <footer className="glass fixed bottom-0 left-0 right-0 flex items-center justify-between border-x-0 border-b-0 px-6 py-4">
        <button
          onClick={() => canPrev && setIndex((value) => value - 1)}
          disabled={!canPrev}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => canNext && setIndex((value) => value + 1)}
          disabled={!canNext}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </footer>
    </main>
  );
}
