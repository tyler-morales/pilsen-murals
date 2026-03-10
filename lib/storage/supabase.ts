/**
 * Supabase Storage implementation for mural display and thumbnail images.
 * Bucket must exist and be public (or use signed URLs if private).
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { getSupabaseClient } from "@/lib/db/client";
import type { MuralStorage, StorageUploadResult } from "./types";

const BUCKET = "murals";

function uniqueFilename(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}.webp`;
}

export const supabaseMuralStorage: MuralStorage = {
  async upload(
    pathPrefix: string,
    buffer: Buffer,
    contentType: string
  ): Promise<StorageUploadResult> {
    const client = getSupabaseClient();
    const path = `${pathPrefix}/${uniqueFilename()}`;
    const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (error) throw error;
    const {
      data: { publicUrl },
    } = client.storage.from(BUCKET).getPublicUrl(path);
    return { url: publicUrl };
  },
};
