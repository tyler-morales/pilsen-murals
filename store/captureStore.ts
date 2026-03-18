"use client";

import { create } from "zustand";
import { getJson, setJson } from "@/lib/localStorage";
import type { SupabaseClient } from "@supabase/supabase-js";

const CAPTURES_STORAGE_KEY = "pilsen-murals-captures";
const USER_CAPTURES_TABLE = "user_captures";

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
  /** Browser Supabase client when authenticated; used for dual-write. Set by AuthProvider. */
  supabaseClient: SupabaseClient | null;
  addCapture: (record: CaptureRecord) => void;
  hasCaptured: (muralId: string) => boolean;
  getCaptureFor: (muralId: string) => CaptureRecord | undefined;
  setSupabaseClient: (client: SupabaseClient | null) => void;
  /** Push local captures to server (call after login). */
  syncLocalCapturesToServer: (client: SupabaseClient) => Promise<void>;
  /** Load server captures and merge into store (call after login). */
  loadServerCaptures: (client: SupabaseClient) => Promise<void>;
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  captures: loadCaptures(),
  supabaseClient: null,

  addCapture: (record) => {
    const { captures, supabaseClient } = get();
    const existing = captures.find((c) => c.muralId === record.muralId);
    const next = existing
      ? captures.map((c) => (c.muralId === record.muralId ? record : c))
      : [...captures, record];
    set({ captures: next });
    persistCaptures(next);

    if (supabaseClient) {
      supabaseClient.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        void supabaseClient
          .from(USER_CAPTURES_TABLE)
          .upsert(
            {
              user_id: data.user.id,
              mural_id: record.muralId,
              captured_at: record.capturedAt,
              lat: record.lat,
              lng: record.lng,
              distance_meters: record.distanceMeters,
            },
            { onConflict: "user_id,mural_id" }
          )
          .then(() => { }, () => { });
      });
    }
  },

  hasCaptured: (muralId) =>
    get().captures.some((c) => c.muralId === muralId),

  getCaptureFor: (muralId) =>
    get().captures.find((c) => c.muralId === muralId),

  setSupabaseClient: (client) => set({ supabaseClient: client }),

  syncLocalCapturesToServer: async (client) => {
    const { data } = await client.auth.getUser();
    if (!data.user) return;
    const { captures } = get();
    if (captures.length === 0) return;
    const userId = data.user.id;
    const rows = captures.map((c) => ({
      user_id: userId,
      mural_id: c.muralId,
      captured_at: c.capturedAt,
      lat: c.lat,
      lng: c.lng,
      distance_meters: c.distanceMeters,
    }));
    await client.from(USER_CAPTURES_TABLE).upsert(rows, {
      onConflict: "user_id,mural_id",
    });
  },

  loadServerCaptures: async (client) => {
    const { data } = await client
      .from(USER_CAPTURES_TABLE)
      .select("mural_id, captured_at, lat, lng, distance_meters");
    if (!data?.length) return;
    const serverRecords: CaptureRecord[] = data.map((row) => ({
      muralId: row.mural_id,
      capturedAt: row.captured_at,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      distanceMeters: row.distance_meters ?? null,
    }));
    const { captures: local } = get();
    const merged = new Map<string, CaptureRecord>();
    for (const c of [...local, ...serverRecords]) {
      const existing = merged.get(c.muralId);
      if (
        !existing ||
        new Date(c.capturedAt) < new Date(existing.capturedAt)
      ) {
        merged.set(c.muralId, c);
      }
    }
    const next = Array.from(merged.values());
    set({ captures: next });
    persistCaptures(next);
  },
}));
