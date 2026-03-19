/**
 * Persists mural submission draft (image + search results) across magic-link auth.
 * When a non-logged-in user clicks "Add to database", we save the draft so that
 * after they sign in and return, we can restore them to the confirm-location step.
 * When they tap "Add to collection" on a matched mural, we save matchedMuralId so
 * after sign-in we restore to the result phase with that mural selected (no location step).
 */

const STORAGE_KEY = "pilsen-murals-pending-mural-draft";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface PendingMuralDraftData {
  imageDataUrl: string;
  searchResult: { results: Array<{ id: string; score: number; payload: Record<string, unknown> }> };
  savedAt: number;
  /** When set, user matched an existing mural and will add to collection (skip confirm-location). */
  matchedMuralId?: string;
}

export async function savePendingMuralDraft(
  blob: Blob,
  searchResult: PendingMuralDraftData["searchResult"],
  matchedMuralId?: string
): Promise<void> {
  if (typeof window === "undefined") return;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result as string;
        const payload: PendingMuralDraftData = {
          imageDataUrl: dataUrl,
          searchResult,
          savedAt: Date.now(),
          ...(matchedMuralId && { matchedMuralId }),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function getRawDraft(): PendingMuralDraftData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingMuralDraftData;
    if (!parsed?.imageDataUrl || !parsed?.searchResult?.results || typeof parsed.savedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getPendingDraftMatchedMuralId(): string | null {
  const draft = getRawDraft();
  return draft?.matchedMuralId ?? null;
}

export function getPendingMuralDraft(): PendingMuralDraftData | null {
  return getRawDraft();
}

export function hasPendingMuralDraft(): boolean {
  const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: number };
    if (typeof parsed?.savedAt !== "number") return false;
    return Date.now() - parsed.savedAt <= TTL_MS;
  } catch {
    return false;
  }
}

export function clearPendingMuralDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",", 2);
  if (!base64) throw new Error("Invalid data URL");
  const mime = /^data:([^;]+);/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
