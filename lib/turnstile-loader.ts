/**
 * Client-side Cloudflare Turnstile script loader.
 * Ensures the Turnstile API script is loaded once to avoid "already loaded" warnings.
 */

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * In development, bypass Turnstile verification entirely.
 */
export const TURNSTILE_DEV_BYPASS =
  typeof process !== "undefined" && process.env.NODE_ENV === "development";

/**
 * Helper to execute Turnstile or bypass in dev mode.
 * In dev, immediately calls the callback with a dummy token.
 * Otherwise, executes the Turnstile widget.
 */
export function executeTurnstileOrBypass(
  containerSelector: string,
  callback: (token: string) => void
): void {
  if (TURNSTILE_DEV_BYPASS) {
    callback("dev-bypass");
    return;
  }
  const win = window as unknown as {
    turnstile?: { execute: (container: string, params: object) => void };
  };
  if (!win.turnstile?.execute) {
    throw new Error("Turnstile not loaded");
  }
  win.turnstile.execute(containerSelector, {});
}

declare global {
  interface Window {
    turnstile?: unknown;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function waitForTurnstile(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const check = () => {
      if (window.turnstile) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/**
 * Ensures the Turnstile script is loaded once. Resolves when window.turnstile is available.
 * Use before calling turnstile.render() or turnstile.execute().
 * In development, this is a no-op (script is not loaded).
 */
export function ensureTurnstileScript(): Promise<void> {
  if (TURNSTILE_DEV_BYPASS) {
    return Promise.resolve();
  }
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
  if (existing) return waitForTurnstile();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => waitForTurnstile().then(resolve);
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}
