"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { getConfig } from "@/lib/api";
import {
  hostTerminalConsent,
  setHostTerminalConsent,
  subscribeHostTerminalConsent,
} from "@/lib/terminal-preferences";
import type { RuntimeConfig } from "@/lib/types";

export default function SettingsPage() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consent = useSyncExternalStore(
    subscribeHostTerminalConsent,
    hostTerminalConsent,
    () => false,
  );

  useEffect(() => {
    void getConfig()
      .then((nextConfig) => {
        setConfig(nextConfig);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Backend config unavailable",
        );
      });
  }, []);

  const backendAllowsTerminal = config?.host_terminal_enabled === true;
  const terminalEnabled = backendAllowsTerminal && consent;
  const terminalStatus = error
    ? "Config unavailable"
    : config
      ? backendAllowsTerminal
        ? terminalEnabled
          ? "Enabled on this browser"
          : "Allowed by backend, off locally"
        : "Locked by backend policy"
      : "Checking backend policy";

  return (
    <main className="min-h-screen bg-[#06080d] px-6 py-8 text-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-500">
              Settings
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Runtime controls
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-white/20 hover:text-white"
          >
            Back to board
          </Link>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-base font-semibold">Host terminal</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Enables the board terminal UI for this browser when the backend
                host terminal gate is already enabled.
              </p>
              <dl className="mt-4 grid gap-2 font-mono text-xs text-slate-500 sm:grid-cols-2">
                <div>
                  <dt className="text-slate-600">Backend gate</dt>
                  <dd className="text-slate-300">
                    {config
                      ? config.host_terminal_enabled
                        ? "enabled"
                        : "disabled"
                      : "checking"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">Runtime</dt>
                  <dd className="text-slate-300">
                    {config?.terminal_runtime ?? "unknown"}
                  </dd>
                </div>
              </dl>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <span className="text-sm text-slate-300">Host terminal</span>
              <input
                aria-label="Host terminal"
                type="checkbox"
                checked={terminalEnabled}
                disabled={!backendAllowsTerminal}
                onChange={(event) => {
                  setHostTerminalConsent(event.target.checked);
                }}
                className="h-5 w-5 accent-sky-400 disabled:cursor-not-allowed"
              />
            </label>
          </div>

          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              terminalEnabled
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : "border-amber-400/20 bg-amber-400/10 text-amber-100"
            }`}
          >
            {terminalStatus}
          </div>
        </section>
      </div>
    </main>
  );
}
