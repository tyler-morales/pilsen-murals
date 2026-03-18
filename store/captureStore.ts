"use client";

import { create } from "zustand";
import { getJson, setJson } from "@/lib/localStorage";

const CAPTURES_STORAGE_KEY = "pilsen-murals-captures";

export interface CaptureRecord {
  muralId: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
}

function loadCaptures(): CaptureRecord[] {
  const parsed = getJson<unknown>(CAPTURES_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (x): x is CaptureRecord =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as CaptureRecord).muralId === "string" &&
      typeof (x as CaptureRecord).capturedAt === "string"
  );
}

function persistCaptures(captures: CaptureRecord[]): void {
  setJson(CAPTURES_STORAGE_KEY, captures);
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
