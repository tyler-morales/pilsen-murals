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
  /** Public URL for user's discovery photo (user-photos bucket). */
  photoUrl?: string | null;
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
  addCapture: (record: CaptureRecord, photoBlob?: Blob) => void | Promise<void>;
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

  addCapture: (record, photoBlob) => {
    const { captures, supabaseClient } = get();

    const applyRecord = (r: CaptureRecord) => {
      const existing = captures.find((c) => c.muralId === r.muralId);
      const next = existing
        ? captures.map((c) => (c.muralId === r.muralId ? r : c))
        : [...captures, r];
      set({ captures: next });
      persistCaptures(next);
    };

    const upsertToServer = (r: CaptureRecord, userId: string) => {
      void supabaseClient!
        .from(USER_CAPTURES_TABLE)
        .upsert(
          {
            user_id: userId,
            mural_id: r.muralId,
            captured_at: r.capturedAt,
            lat: r.lat,
            lng: r.lng,
            distance_meters: r.distanceMeters,
            photo_url: r.photoUrl ?? null,
          },
          { onConflict: "user_id,mural_id" }
        )
        .then(() => { }, () => { });
    };

    if (supabaseClient && photoBlob) {
      return supabaseClient.auth.getUser().then(async ({ data }) => {
        if (!data.user) {
          applyRecord(record);
          return;
        }
        const userId = data.user.id;
        const path = `${userId}/${record.muralId}.webp`;
        const { error: uploadError } = await supabaseClient.storage
          .from("user-photos")
          .upload(path, photoBlob, { upsert: true, contentType: photoBlob.type || "image/jpeg" });
        if (uploadError) {
          applyRecord(record);
          upsertToServer(record, userId);
          return;
        }
        const { data: urlData } = supabaseClient.storage.from("user-photos").getPublicUrl(path);
        const r: CaptureRecord = { ...record, photoUrl: urlData.publicUrl };
        applyRecord(r);
        upsertToServer(r, userId);
      });
    }

    applyRecord(record);
    if (supabaseClient) {
      supabaseClient.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        upsertToServer(record, data.user.id);
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
      photo_url: c.photoUrl ?? null,
    }));
    await client.from(USER_CAPTURES_TABLE).upsert(rows, {
      onConflict: "user_id,mural_id",
    });
  },

  loadServerCaptures: async (client) => {
    const { data } = await client
      .from(USER_CAPTURES_TABLE)
      .select("mural_id, captured_at, lat, lng, distance_meters, photo_url");
    if (!data?.length) return;
    const serverRecords: CaptureRecord[] = data.map((row) => ({
      muralId: row.mural_id,
      capturedAt: row.captured_at,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      distanceMeters: row.distance_meters ?? null,
      photoUrl: row.photo_url ?? null,
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
