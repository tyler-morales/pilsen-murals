/**
 * Client-side Cloudflare Turnstile script loader.
 * Ensures the Turnstile API script is loaded once to avoid "already loaded" warnings.
 */

export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

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
 */
export function ensureTurnstileScript(): Promise<void> {
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
