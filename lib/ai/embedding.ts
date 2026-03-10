/**
 * CLIP image embedding for visual similarity search.
 * Produces a 512-d "visual fingerprint" used by Qdrant; the same model and size must be
 * used for both indexing (POST /api/murals) and querying (POST /api/search).
 * Server-side only (Node); not for browser use.
 */
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@xenova/transformers";

const MODEL_ID = "Xenova/clip-vit-base-patch32";

let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null =
  null;
let visionModel: Awaited<
  ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>
> | null = null;

async function getModel() {
  if (!processor || !visionModel) {
    [processor, visionModel] = await Promise.all([
      AutoProcessor.from_pretrained(MODEL_ID),
      CLIPVisionModelWithProjection.from_pretrained(MODEL_ID),
    ]);
  }
  return { processor: processor!, visionModel: visionModel! };
}

/**
 * Load image into RawImage: from URL (string), or from File/Blob (e.g. multipart upload or buffer).
 * Blob is supported so Node scripts can pass fs-read buffers without file:// (which Xenova fetch rejects).
 */
async function loadImage(
  image: File | Blob | string
): Promise<InstanceType<typeof RawImage>> {
  if (typeof image === "string") {
    return RawImage.read(image);
  }
  return RawImage.fromBlob(image);
}

/**
 * Generate a 512-d CLIP image embedding for the given image (File, Blob, or URL).
 * Used for both indexing murals and for visual search queries; ensures comparable vectors.
 */
export async function getImageEmbedding(
  image: File | Blob | string
): Promise<number[]> {
  const rawImage = await loadImage(image);
  const { processor, visionModel } = await getModel();
  const imageInputs = await processor(rawImage);
  const { image_embeds } = await visionModel(imageInputs);
  // image_embeds: Tensor shape [1, 512]; flatten to number[] for Qdrant
  const list = image_embeds.tolist();
  const flat = Array.isArray(list[0]) ? (list[0] as number[]) : (list as number[]);
  if (flat.length !== 512) {
    throw new Error(`Expected 512-d embedding, got ${flat.length}`);
  }
  return flat;
}
