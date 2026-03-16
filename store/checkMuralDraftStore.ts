"use client";

/**
 * Persisted draft state for the Check a mural flow. Restored when the user
 * reopens the modal (same tab or after closing the tab). Cleared on
 * "Check another" or when the flow completes (confirmed).
 */

export type DraftPhase =
  | "edit"
  | "checking"
  | "result"
  | "confirm-location"
  | "error";

export interface SearchResultItem {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResultItem[];
}

export interface CheckMuralDraft {
  version?: number;
  phase: DraftPhase;
  searchResult?: SearchResponse | null;
  selectedResultId?: string | "none" | null;
  submitTitle: string;
  submitArtist: string;
  searchError?: string | null;
  /** True when phase required an image but it was too large to store. */
  imageOmitted?: boolean;
}

const DRAFT_JSON_KEY = "pilsen-murals-check-draft";
const DRAFT_IMAGE_KEY = "pilsen-murals-check-draft-image";
const DRAFT_VERSION = 1;
/** Base64 string length cap to avoid exceeding typical 5MB localStorage. */
const MAX_IMAGE_BASE64_LENGTH = 3 * 1024 * 1024;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function parseSelectedResultId(
  v: unknown
): string | "none" | null | undefined {
  if (v === null || v === undefined) return v;
  if (v === "none") return "none";
  if (typeof v === "string") return v;
  return undefined;
}

function parseSearchResponse(v: unknown): SearchResponse | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.results)) return null;
  const results = o.results.filter(
    (r): r is SearchResultItem =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as SearchResultItem).id === "string" &&
      typeof (r as SearchResultItem).score === "number" &&
      typeof (r as SearchResultItem).payload === "object"
  );
  return { results };
}

export function loadDraft(): CheckMuralDraft | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_JSON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const phase = o.phase as DraftPhase | undefined;
    const validPhases: DraftPhase[] = [
      "edit",
      "checking",
      "result",
      "confirm-location",
      "error",
    ];
    if (!phase || !validPhases.includes(phase)) return null;
    const searchResult = o.searchResult != null ? parseSearchResponse(o.searchResult) : null;
    const selectedResultId = parseSelectedResultId(o.selectedResultId);
    const submitTitle = typeof o.submitTitle === "string" ? o.submitTitle : "";
    const submitArtist = typeof o.submitArtist === "string" ? o.submitArtist : "";
    const searchError =
      o.searchError != null && typeof o.searchError === "string"
        ? o.searchError
        : undefined;
    const imageOmitted = o.imageOmitted === true;
    const draft: CheckMuralDraft = {
      version: typeof o.version === "number" ? o.version : undefined,
      phase,
      searchResult: searchResult ?? undefined,
      selectedResultId,
      submitTitle,
      submitArtist,
      searchError,
      imageOmitted,
    };
    const imageBase64 = storage.getItem(DRAFT_IMAGE_KEY);
    if (imageBase64 && typeof imageBase64 === "string") {
      (draft as CheckMuralDraft & { imageBase64?: string }).imageBase64 =
        imageBase64;
    }
    return draft;
  } catch {
    return null;
  }
}

/**
 * Decode base64 data URL to a Blob. Returns null if missing or invalid.
 */
export function draftImageBase64ToBlob(draft: CheckMuralDraft): Blob | null {
  const withImage = draft as CheckMuralDraft & { imageBase64?: string };
  const b64 = withImage.imageBase64;
  if (!b64 || typeof b64 !== "string") return null;
  try {
    const comma = b64.indexOf(",");
    const base64 = comma >= 0 ? b64.slice(comma + 1) : b64;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const mime = b64.startsWith("data:") ? b64.slice(0, comma).match(/^data:([^;]+)/)?.[1] : "image/jpeg";
    return new Blob([bytes], { type: mime || "image/jpeg" });
  } catch {
    return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result : "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Save draft with optional image blob. Persists image only if base64 fits under cap. */
export async function saveDraft(
  draft: Omit<CheckMuralDraft, "imageOmitted"> & { imageBlob?: Blob | null }
): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  try {
    const { imageBlob, ...rest } = draft;
    let imageOmitted = false;
    let imageBase64: string | undefined;
    if (imageBlob && imageBlob.size > 0) {
      const dataUrl = await blobToDataUrl(imageBlob);
      if (dataUrl.length <= MAX_IMAGE_BASE64_LENGTH) {
        imageBase64 = dataUrl;
      } else {
        imageOmitted = true;
      }
    }
    const toStore: CheckMuralDraft = {
      ...rest,
      version: DRAFT_VERSION,
      imageOmitted: imageOmitted || undefined,
    };
    storage.setItem(DRAFT_JSON_KEY, JSON.stringify(toStore));
    if (imageBase64) {
      storage.setItem(DRAFT_IMAGE_KEY, imageBase64);
    } else {
      storage.removeItem(DRAFT_IMAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearDraft(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_JSON_KEY);
    storage.removeItem(DRAFT_IMAGE_KEY);
  } catch {
    // ignore
  }
}
