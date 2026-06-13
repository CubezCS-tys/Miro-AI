"use client";

import { useEffect, useMemo, useState } from "react";
import {
  answerArenaQuestion,
  createArenaSession,
  finishArenaSession,
} from "@/lib/api";
import type {
  ArenaAnswerResponse,
  ArenaFinishResponse,
  ArenaQuestion,
  ArenaSession,
  GraphNode,
} from "@/lib/types";

type ArenaNode = GraphNode & { node_id?: string };

interface ArenaPayload {
  board_id: string;
  selected_nodes: ArenaNode[];
}

export default function ArenaPage() {
  const [payload, setPayload] = useState<ArenaPayload | null>(null);
  const [session, setSession] = useState<ArenaSession | null>(null);
  const [question, setQuestion] = useState<ArenaQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [lastResult, setLastResult] = useState<ArenaAnswerResponse | null>(null);
  const [finish, setFinish] = useState<ArenaFinishResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = localStorage.getItem("miro-ai-arena");
      if (!raw) return;
      try {
        setPayload(JSON.parse(raw) as ArenaPayload);
      } catch {
        setError("Could not load selected graph region.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!payload || session) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      createArenaSession({
        board_id: payload.board_id,
        selected_nodes: payload.selected_nodes,
        mode: "socratic",
      })
        .then((created) => {
          if (cancelled) return;
          setSession(created);
          setQuestion(created.current_question);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Could not start arena");
          }
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payload, session]);

  const masteryEntries = useMemo(
    () => Object.entries(lastResult?.mastery ?? session?.mastery ?? {}),
    [lastResult, session],
  );

  const submitAnswer = async () => {
    if (!session || !question || !answer.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await answerArenaQuestion(session.session_id, answer.trim());
      setLastResult(result);
      setQuestion(result.next_question);
      setAnswer("");
      if (!result.next_question) {
        setFinish(await finishArenaSession(session.session_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Answer failed");
    } finally {
      setBusy(false);
    }
  };

  const finishNow = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      setFinish(await finishArenaSession(session.session_id));
      setQuestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finish failed");
    } finally {
      setBusy(false);
    }
  };

  if (!payload?.selected_nodes.length) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060912] px-6 text-slate-300">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-100">No arena loaded</h1>
          <p className="mt-2 text-sm text-slate-500">
            Select grounded concept nodes on the board, then open Tutor Arena.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#060912] text-slate-100">
      <header className="fixed left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#060912]/90 px-6 py-4 backdrop-blur">
        <div>
          <div className="text-sm font-semibold text-cyan-200">Graph Tutor Arena</div>
          <div className="mt-1 text-xs text-slate-500">
            {payload.selected_nodes.length} selected node(s)
          </div>
        </div>
        <button
          onClick={() => void finishNow()}
          disabled={!session || busy}
          className="rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Finish session
        </button>
      </header>

      <section className="grid min-h-screen grid-cols-[280px_1fr_340px] gap-4 px-6 pb-6 pt-24">
        <aside className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Region mastery
          </div>
          <div className="space-y-2">
            {payload.selected_nodes.map((node) => {
              const nodeId = node.node_id ?? node.id;
              const mastery = masteryEntries.find(([id]) => id === nodeId)?.[1];
              const score = mastery?.score ?? 0.2;
              return (
                <div key={nodeId} className="rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {node.label}
                    </div>
                    <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                      {mastery?.state ?? "unknown"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-cyan-300"
                      style={{ width: `${Math.round(score * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
          {busy && !question && !finish && (
            <div className="shimmer-text text-sm">Starting arena...</div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {question && (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded bg-cyan-400/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                  {question.kind}
                </span>
                <span className="rounded bg-white/5 px-2 py-1 text-xs font-semibold text-slate-400">
                  p{question.source_page ?? "?"}
                </span>
              </div>
              <h1 className="max-w-3xl text-3xl font-bold leading-tight text-slate-50">
                {question.question}
              </h1>
              <blockquote className="mt-6 max-w-3xl border-l-2 border-cyan-300/50 pl-4 text-sm italic leading-relaxed text-slate-400">
                {question.source_quote}
              </blockquote>
              {lastResult && (
                <div className="mt-6 rounded-xl border border-white/8 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Last evaluation
                  </div>
                  <div className="mt-2 text-sm font-semibold text-cyan-100">
                    {lastResult.evaluation.verdict}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    {lastResult.evaluation.feedback}
                  </p>
                </div>
              )}
              <div className="mt-auto pt-8">
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Answer from the source first, then reason from it."
                  className="min-h-32 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => void submitAnswer()}
                    disabled={busy || !answer.trim()}
                    className="rounded-xl bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Checking" : "Submit answer"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {finish && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                  Session output
                </div>
                <h1 className="mt-2 text-3xl font-bold text-slate-50">
                  Review pack ready
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                  {finish.graph_revision.summary}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {finish.flashcards.map((card) => (
                  <div
                    key={`${card.node_id}-${card.front}`}
                    className="rounded-xl border border-white/8 bg-black/20 p-4"
                  >
                    <div className="text-sm font-semibold text-slate-100">
                      {card.front}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-slate-400">
                      {card.back}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Presentation path
          </div>
          <div className="space-y-2">
            {(finish?.presentation_path ?? payload.selected_nodes.map((node, index) => ({
              step: index + 1,
              node_id: node.node_id ?? node.id,
              title: node.label,
              source_page: node.source_page ?? null,
            }))).map((item) => (
              <div
                key={`${item.step}-${item.node_id}`}
                className="rounded-xl border border-white/8 bg-black/20 p-3"
              >
                <div className="text-[11px] font-semibold text-cyan-200">
                  Step {item.step} | p{item.source_page ?? "?"}
                </div>
                <div className="mt-1 text-sm text-slate-200">{item.title}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
