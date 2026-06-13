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
      <main className="flex min-h-screen items-center justify-center bg-[#060912] px-6 text-slate-300">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-100">No presentation loaded</h1>
          <p className="mt-2 text-sm text-slate-500">
            Select grounded concept nodes on the board, then open presentation mode.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#060912] text-slate-100">
      <header className="fixed left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#060912]/90 px-6 py-4 backdrop-blur">
        <div className="text-sm font-semibold text-cyan-200">Miro-AI presentation</div>
        <div className="text-xs text-slate-500">{progress}</div>
      </header>

      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-8 py-24">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-cyan-400/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
            {slide.kind}
          </span>
          <span className="rounded bg-white/5 px-2 py-1 text-xs font-semibold text-slate-400">
            p{page ?? "?"}
          </span>
          {source?.verified === false && (
            <span className="rounded bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">
              needs review
            </span>
          )}
        </div>
        <h1 className="max-w-4xl text-5xl font-bold leading-tight text-slate-50">
          {slide.label}
        </h1>
        <p className="mt-8 max-w-3xl text-xl leading-relaxed text-slate-300">
          {slide.summary}
        </p>
        <blockquote className="mt-10 max-w-3xl border-l-2 border-cyan-300/50 pl-5 text-base italic leading-relaxed text-slate-400">
          {slide.source_quote || "No source quote attached."}
        </blockquote>
      </section>

      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-between border-t border-white/8 bg-[#060912]/90 px-6 py-4 backdrop-blur">
        <button
          onClick={() => canPrev && setIndex((value) => value - 1)}
          disabled={!canPrev}
          className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => canNext && setIndex((value) => value + 1)}
          disabled={!canNext}
          className="rounded-lg bg-white/5 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </footer>
    </main>
  );
}
