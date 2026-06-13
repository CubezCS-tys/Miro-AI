"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { getConfig } from "@/lib/api";
import {
  hostTerminalConsent,
  setHostTerminalConsent,
  subscribeHostTerminalConsent,
} from "@/lib/terminal-preferences";
import { useTheme } from "@/lib/use-theme";
import type { RuntimeConfig } from "@/lib/types";

export default function SettingsPage() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();
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
    <main className="min-h-screen bg-canvas px-6 py-8 text-fg">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-faint">
              Settings
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Runtime controls
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <Link
              href="/"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              Back to board
            </Link>
          </div>
        </header>

        <section className="glass rounded-xl p-5 shadow-[var(--shadow-panel)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-base font-semibold">Host terminal</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Enables the board terminal UI for this browser when the backend
                host terminal gate is already enabled.
              </p>
              <dl className="mt-4 grid gap-2 font-mono text-xs text-faint sm:grid-cols-2">
                <div>
                  <dt>Backend gate</dt>
                  <dd className="text-fg">
                    {error
                      ? "unavailable"
                      : config
                        ? config.host_terminal_enabled
                          ? "enabled"
                          : "disabled"
                      : "checking"}
                  </dd>
                </div>
                <div>
                  <dt>Runtime</dt>
                  <dd className="text-fg">
                    {config?.terminal_runtime ?? (error ? "unavailable" : "unknown")}
                  </dd>
                </div>
              </dl>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
              <span className="text-sm text-fg">Host terminal</span>
              <input
                aria-label="Host terminal"
                type="checkbox"
                checked={terminalEnabled}
                disabled={!backendAllowsTerminal}
                onChange={(event) => {
                  setHostTerminalConsent(event.target.checked);
                }}
                className="h-5 w-5 accent-accent disabled:cursor-not-allowed"
              />
            </label>
          </div>

          <div
            className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
              terminalEnabled
                ? "border-line bg-surface-2 text-fg"
                : "border-line bg-transparent text-muted"
            }`}
          >
            {terminalStatus}
          </div>
        </section>
      </div>
    </main>
  );
}
