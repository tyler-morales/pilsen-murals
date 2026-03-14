import { haversineDistanceMeters } from "@/lib/geo";
import type { Mural } from "@/types/mural";

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

/** 18th & Ashland centroid (main street reference). */
const PILSEN_CENTROID: [number, number] = [-87.6675, 41.8568];

/** Murals painted over or no longer exist; manual tagging. */
const LEGENDARY_IDS = new Set<string>([]);

const COMMON_RADIUS_M = 200;
const UNCOMMON_RADIUS_M = 400;

/**
 * Computes rarity from mural coordinates: distance from 18th & Ashland.
 * Common: within 200m (main street). Uncommon: 200–400m. Rare: >400m. Legendary: in LEGENDARY_IDS.
 */
export function computeRarity(mural: Mural): Rarity {
  if (LEGENDARY_IDS.has(mural.id)) return "legendary";
  const distanceM = haversineDistanceMeters(PILSEN_CENTROID, mural.coordinates);
  if (distanceM < COMMON_RADIUS_M) return "common";
  if (distanceM < UNCOMMON_RADIUS_M) return "uncommon";
  return "rare";
}
