import type { Collection } from "@/types/collection";
import type { Mural } from "@/types/mural";

/**
 * Resolve a collection's muralIds to ordered Mural objects.
 * Murals not found in the list are skipped (keeps order by muralIds).
 */
export function getOrderedMuralsForCollection(
  collection: Collection,
  murals: Mural[]
): Mural[] {
  const byId = new Map(murals.map((m) => [m.id, m]));
  return collection.muralIds
    .map((id) => byId.get(id))
    .filter((m): m is Mural => m != null);
}
