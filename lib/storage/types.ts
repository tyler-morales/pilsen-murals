/**
 * Provider-agnostic contract for storing processed mural images.
 * Implementations return public URLs for display and thumbnail.
 */
export interface StorageUploadResult {
  url: string;
}

export interface MuralStorage {
  /**
   * Upload a buffer (e.g. WebP bytes) and return the public URL.
   * pathPrefix e.g. "murals/display" or "murals/thumbnails"; implementation adds unique filename.
   */
  upload(
    pathPrefix: string,
    buffer: Buffer,
    contentType: string
  ): Promise<StorageUploadResult>;
}
