export interface Mural {
  id: string;
  title: string;
  artist: string;
  /** Instagram username (no @) for linking to artist profile. Shown as link when present. */
  artistInstagramHandle?: string;
  coordinates: [number, number];
  /** Compass bearing in degrees (0 = north, 90 = east). Used to orient the map when flying to this mural. */
  bearing?: number;
  dominantColor: string;
  imageUrl: string;
  /** Thumbnail image URL for map markers. Falls back to imageUrl if absent. */
  thumbnail?: string;
  /** EXIF/image metadata (e.g. date, camera, exposure). Populated by generate-map-data. */
  imageMetadata?: Record<string, string>;
  /** When the photo was taken (ISO). Shown in mural description. */
  dateCaptured?: string;
  /** When the mural was painted (YYYY-MM-DD). Shown as year or full date when known. */
  datePainted?: string | null;
  /** Legacy: year painted when only year is known. */
  yearPainted?: number | null;
}
