import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION_NAME = "pilsen_murals";

/** Qdrant client singleton so API routes reuse one connection. */
let client: QdrantClient | null = null;

/**
 * Returns a Qdrant client configured from env (QDRANT_URL, QDRANT_API_KEY).
 * Used by API routes and the setup script. Next.js loads .env.local automatically at runtime.
 */
export function getQdrantClient(): QdrantClient {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url) {
    throw new Error("QDRANT_URL is not set in environment");
  }
  if (!client) {
    client = new QdrantClient({
      url,
      ...(apiKey && { apiKey }),
    });
  }
  return client;
}

export { COLLECTION_NAME };
