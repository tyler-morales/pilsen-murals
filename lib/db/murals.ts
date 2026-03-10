/**
 * Server-side mural list for map. Uses DB as canonical source; falls back to static JSON when DB is not configured or fails (migration window).
 */
import { selectAllMurals } from "./client";
import { muralRowToApp, type MuralForApp } from "./schema";
import type { Mural } from "@/types/mural";

export async function getMuralsForMap(): Promise<Mural[]> {
  try {
    const rows = await selectAllMurals();
    if (rows.length > 0) return rows.map((row) => muralRowToApp(row) as Mural);
  } catch {
    // DB unavailable: use fallback below.
  }
  const data = await import("@/data/murals.json");
  return (data.default ?? []) as unknown as Mural[];
}

export async function getMuralsForMapStrict(): Promise<MuralForApp[]> {
  const rows = await selectAllMurals();
  return rows.map(muralRowToApp);
}
