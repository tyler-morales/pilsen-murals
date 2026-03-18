export const GENERIC_ERROR_MESSAGE =
  "We couldn't complete this action. Please try again.";

/** Prevents technical server messages from reaching the user. */
export function sanitizeErrorFromServer(msg: string | undefined): string {
  if (!msg || typeof msg !== "string") return GENERIC_ERROR_MESSAGE;
  const t = msg.toLowerCase();
  if (
    t.includes("econnrefused") ||
    t.includes("timeout") ||
    t.includes("relation") ||
    t.includes("fetch failed") ||
    t.includes("network") ||
    msg.length > 120
  )
    return GENERIC_ERROR_MESSAGE;
  return msg;
}
