/**
 * A walking tour or collection: ordered set of murals by ID.
 * Resolved against murals.json; no new fields on Mural.
 */
export interface Collection {
  id: string;
  name: string;
  description?: string;
  /** Ordered mural IDs (walking order). */
  muralIds: string[];
  /** Optional estimated duration in minutes. */
  estimatedMinutes?: number;
}
