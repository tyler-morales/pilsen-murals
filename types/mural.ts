export interface Mural {
  id: string;
  title: string;
  artist: string;
  coordinates: [number, number];
  /** Compass bearing in degrees (0 = north, 90 = east). Used to orient the map when flying to this mural. */
  bearing?: number;
  dominantColor: string;
  imageUrl: string;
  /** Thumbnail image URL for map markers. Falls back to imageUrl if absent. */
  thumbnail?: string;
  address: string;
  /** EXIF/image metadata (e.g. date, camera, exposure). Populated by generate-map-data. */
  imageMetadata?: Record<string, string>;
}
