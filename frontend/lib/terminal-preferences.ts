export const HOST_TERMINAL_CONSENT_KEY = "miro-ai-host-terminal-consent";
const HOST_TERMINAL_CONSENT_EVENT = "miro-ai-host-terminal-consent-change";

export function hostTerminalConsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HOST_TERMINAL_CONSENT_KEY) === "true";
}

export function setHostTerminalConsent(enabled: boolean): void {
  if (typeof window === "undefined") return;
  const nextValue = enabled ? "true" : "false";
  window.localStorage.setItem(HOST_TERMINAL_CONSENT_KEY, nextValue);
  window.dispatchEvent(new Event(HOST_TERMINAL_CONSENT_EVENT));
}

export function subscribeHostTerminalConsent(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === HOST_TERMINAL_CONSENT_KEY) listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(HOST_TERMINAL_CONSENT_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HOST_TERMINAL_CONSENT_EVENT, listener);
  };
}
