/**
 * One-time (or on-demand) script to create the pilsen_murals collection in Qdrant Cloud.
 * Vectors are CLIP image embeddings: 512 dimensions, Cosine distance (CLIP outputs are
 * L2-normalized, so cosine similarity is equivalent to dot product and is the standard
 * choice for CLIP retrieval).
 *
 * Run: npm run qdrant:setup  (or npx tsx lib/qdrant/setup.ts)
 * Loads .env.local for QDRANT_URL and QDRANT_API_KEY when run standalone.
 */
import dotenv from "dotenv";
import { getQdrantClient, COLLECTION_NAME } from "./client";

dotenv.config({ path: ".env.local" });

const VECTOR_SIZE = 512;
const VECTOR_DISTANCE = "Cosine" as const;

async function main() {
  const client = getQdrantClient();

  try {
    const exists = await client.collectionExists(COLLECTION_NAME);
    if (exists.exists) {
      console.log(`Collection "${COLLECTION_NAME}" already exists. Skipping creation.`);
      return;
    }
  } catch {
    // collectionExists may throw if server unreachable; we'll fail on createCollection
  }

  await client.createCollection(COLLECTION_NAME, {
    vectors: {
      size: VECTOR_SIZE,
      distance: VECTOR_DISTANCE,
    },
  });
  console.log(`Created collection "${COLLECTION_NAME}" with vectors size=${VECTOR_SIZE}, distance=${VECTOR_DISTANCE}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
