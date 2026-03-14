"use client";

import { create } from "zustand";

const CAPTURES_STORAGE_KEY = "pilsen-murals-captures";

export interface CaptureRecord {
  muralId: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
}

function loadCaptures(): CaptureRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CAPTURES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CaptureRecord =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as CaptureRecord).muralId === "string" &&
        typeof (x as CaptureRecord).capturedAt === "string"
    );
  } catch {
    return [];
  }
}

function persistCaptures(captures: CaptureRecord[]): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(CAPTURES_STORAGE_KEY, JSON.stringify(captures));
  } catch {
    // ignore
  }
}

interface CaptureState {
  captures: CaptureRecord[];
  addCapture: (record: CaptureRecord) => void;
  hasCaptured: (muralId: string) => boolean;
  getCaptureFor: (muralId: string) => CaptureRecord | undefined;
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  captures: loadCaptures(),

  addCapture: (record) => {
    const { captures } = get();
    const existing = captures.find((c) => c.muralId === record.muralId);
    const next = existing
      ? captures.map((c) => (c.muralId === record.muralId ? record : c))
      : [...captures, record];
    set({ captures: next });
    persistCaptures(next);
  },

  hasCaptured: (muralId) =>
    get().captures.some((c) => c.muralId === muralId),

  getCaptureFor: (muralId) =>
    get().captures.find((c) => c.muralId === muralId),
}));
