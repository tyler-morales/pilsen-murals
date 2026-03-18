/**
 * Validates that a URL is safe for server-side fetch (prevents SSRF).
 * Allows only https and rejects private/reserved IP ranges and localhost.
 */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") return false;
    if (hostname.startsWith("192.168.") || hostname.startsWith("10.")) return false;
    if (hostname.startsWith("169.254.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
