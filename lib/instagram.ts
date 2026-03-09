/**
 * Instagram profile URL from handle. Strips leading @ so both "user" and "@user" work.
 */
export function getArtistInstagramUrl(handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  return `https://instagram.com/${encodeURIComponent(clean)}`;
}
