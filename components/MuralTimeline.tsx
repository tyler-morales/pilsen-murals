"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { AnimatePresence } from "framer-motion";
import { useHaptics } from "@/hooks/useHaptics";
import { useAuthStore } from "@/store/authStore";
import { isLightColor } from "@/lib/colorUtils";
import { MuralTimelineViewer } from "@/components/MuralTimelineViewer";
import { ensureTurnstileScript } from "@/lib/turnstile-loader";
import { Plus } from "lucide-react";

export interface TimelinePhoto {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  dateLabel: string;
  isOriginal?: boolean;
}

interface MuralTimelineProps {
  muralId: string;
  canonicalImageUrl: string;
  canonicalThumbnailUrl?: string;
  canonicalDateLabel: string;
  dominantColor: string;
  onRequestAuth?: (title: string, message: string) => void;
  onPhotoAdded?: () => void;
}

const TURNSTILE_CONTAINER_ID = "mural-timeline-turnstile";

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(d);
}

export function MuralTimeline({
  muralId,
  canonicalImageUrl,
  canonicalThumbnailUrl,
  canonicalDateLabel,
  dominantColor,
  onRequestAuth,
  onPhotoAdded,
}: MuralTimelineProps): React.ReactElement {
  const haptics = useHaptics();
  const user = useAuthStore((s) => s.user);
  const [photos, setPhotos] = useState<TimelinePhoto[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const isLight = isLightColor(dominantColor);

  const timelineItems: TimelinePhoto[] = [
    {
      id: "original",
      imageUrl: canonicalImageUrl,
      thumbnailUrl: canonicalThumbnailUrl ?? canonicalImageUrl,
      dateLabel: canonicalDateLabel,
      isOriginal: true,
    },
    ...photos,
  ];

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/murals/${muralId}/photos`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = (await res.json()) as {
        photos: { id: string; imageUrl: string; thumbnailUrl: string; createdAt: string }[];
      };
      setPhotos(
        (data.photos ?? []).map((p) => ({
          id: p.id,
          imageUrl: p.imageUrl,
          thumbnailUrl: p.thumbnailUrl ?? p.imageUrl,
          dateLabel: formatTimelineDate(p.createdAt),
          isOriginal: false,
        }))
      );
    } catch {
      setPhotos([]);
    }
  }, [muralId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    dragFree: true,
    containScroll: "trimSnaps",
    align: "start",
  });

  const handleNodeClick = useCallback(
    (index: number) => {
      haptics.tap();
      setViewerIndex(index);
    },
    [haptics]
  );

  const handleAddClick = useCallback(() => {
    if (!user) {
      onRequestAuth?.(
        "Sign in to add a photo",
        "Create an account to add your photo to this mural's timeline."
      );
      return;
    }
    haptics.tap();
    fileInputRef.current?.click();
  }, [user, onRequestAuth, haptics]);

  const submitPhotoRef = useRef<
    (token: string, file: File) => Promise<void>
  >(() => Promise.resolve());
  const submitPhoto = useCallback(
    async (token: string, file: File) => {
      setUploadError(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.set("turnstileToken", token);
        form.set("image", file);
        const res = await fetch(`/api/murals/${muralId}/photos`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? "Upload failed"
          );
        }
        await fetchPhotos();
        onPhotoAdded?.();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        pendingFileRef.current = null;
      }
    },
    [muralId, fetchPhotos, onPhotoAdded]
  );
  submitPhotoRef.current = submitPhoto;

  useEffect(() => {
    const turnstileSiteKey =
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
    if (!turnstileSiteKey || !document.getElementById(TURNSTILE_CONTAINER_ID))
      return;
    const win = window as unknown as {
      turnstile?: {
        render: (container: string, options: Record<string, unknown>) => string;
        execute: (container: string, opts: object) => void;
        remove?: (id: string) => void;
      };
    };
    let cancelled = false;
    void ensureTurnstileScript().then(() => {
      if (cancelled) return;
      if (win.turnstile?.render) {
        turnstileWidgetIdRef.current = win.turnstile.render(
          `#${TURNSTILE_CONTAINER_ID}`,
          {
            sitekey: turnstileSiteKey,
            size: "invisible",
            execution: "execute" as const,
            callback: (token: string) => {
              const file = pendingFileRef.current;
              if (file) submitPhotoRef.current(token, file);
            },
          }
        );
      }
    });
    return () => {
      cancelled = true;
      if (turnstileWidgetIdRef.current && win.turnstile?.remove) {
        win.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !file.type.startsWith("image/")) return;
      const turnstileSiteKey =
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
      if (!turnstileSiteKey) {
        setUploadError("Upload is not configured. Try again later.");
        return;
      }
      pendingFileRef.current = file;
      const win = window as unknown as {
        turnstile?: { execute: (sel: string, opts: object) => void };
      };
      try {
        win.turnstile?.execute(`#${TURNSTILE_CONTAINER_ID}`, {});
      } catch {
        setUploadError("Captcha failed. Try again.");
        pendingFileRef.current = null;
      }
    },
    []
  );

  const totalCount = timelineItems.length;
  const trackColor = isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.35)";
  const nodeColor = isLight ? "#18181b" : "rgba(255,255,255,0.9)";
  const showFullTimeline = photos.length >= 1;

  if (!showFullTimeline) {
    return (
      <section
        className="mt-8 border-t pt-5"
        style={{ borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.15)" }}
        aria-label="Mural photo timeline"
      >
        <p
          className={`text-mobile-footnote ${isLight ? "text-zinc-600" : "text-white/70"}`}
        >
          Add your photo to start this mural&apos;s timeline.
        </p>
        <div className="mt-3 flex flex-col items-center">
          <button
            type="button"
            onClick={handleAddClick}
            disabled={uploading}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:opacity-50"
            style={{
              borderColor: trackColor,
              color: isLight ? "#71717a" : "rgba(255,255,255,0.7)",
            }}
            aria-label="Add your photo to the timeline"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
          <span
            className={`mt-2 text-center text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}
          >
            Add photo
          </span>
        </div>
        {uploadError && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {uploadError}
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-hidden
          onChange={handleFileChange}
        />
        <div
          id={TURNSTILE_CONTAINER_ID}
          className="absolute h-0 w-0 overflow-hidden"
          aria-hidden
        />
      </section>
    );
  }

  return (
    <section
      className="mt-8 border-t pt-5"
      style={{ borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.15)" }}
      aria-label="Mural photo timeline"
    >
      <p
        className={`text-mobile-caption font-medium uppercase tracking-[0.08em] ${isLight ? "text-zinc-600" : "text-white/70"}`}
      >
        Timeline ({totalCount} photo{totalCount !== 1 ? "s" : ""})
      </p>

      <div className="mt-3 overflow-hidden" ref={emblaRef}>
        <div
          className="relative flex touch-pan-y cursor-grab active:cursor-grabbing"
          style={{ gap: "2rem" }}
          role="region"
          aria-roledescription="timeline"
        >
          <div
            className="absolute left-[50px] right-[50px] top-6 h-0.5 -translate-y-1/2"
            style={{ backgroundColor: trackColor }}
            aria-hidden
          />
          {timelineItems.map((item, index) => (
            <div
              key={item.id}
              className="relative flex min-w-0 flex-shrink-0 flex-col items-center"
              style={{ width: "100px" }}
            >
              <button
                type="button"
                onClick={() => handleNodeClick(index)}
                className="relative z-10 mt-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                style={{
                  backgroundColor: nodeColor,
                  borderColor: trackColor,
                }}
                aria-label={`Photo from ${item.dateLabel}, ${index + 1} of ${totalCount}. Tap to view full screen`}
              >
                <span className="sr-only">
                  {item.dateLabel} — view full screen
                </span>
              </button>
              <div className="mt-2 h-[72px] w-[72px] overflow-hidden rounded-lg shadow-md">
                <Image
                  src={item.thumbnailUrl}
                  alt=""
                  width={72}
                  height={72}
                  className="h-full w-full object-cover"
                  unoptimized={item.imageUrl.startsWith("http")}
                />
              </div>
              <span
                className={`mt-1.5 max-w-[100px] truncate text-center text-xs ${isLight ? "text-zinc-600" : "text-white/80"}`}
              >
                {item.dateLabel}
              </span>
            </div>
          ))}

          <div
            className="relative flex min-w-0 flex-shrink-0 flex-col items-center"
            style={{ width: "100px" }}
          >
            <button
              type="button"
              onClick={handleAddClick}
              disabled={uploading}
              className="relative z-10 mt-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:opacity-50"
              style={{
                borderColor: trackColor,
                color: isLight ? "#71717a" : "rgba(255,255,255,0.7)",
              }}
              aria-label="Add your photo to the timeline"
            >
              <Plus className="h-5 w-5" aria-hidden />
            </button>
            <span
              className={`mt-4 text-center text-xs ${isLight ? "text-zinc-500" : "text-white/60"}`}
            >
              Add photo
            </span>
          </div>
        </div>
      </div>

      {uploadError && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {uploadError}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={handleFileChange}
      />
      <div
        id={TURNSTILE_CONTAINER_ID}
        className="absolute h-0 w-0 overflow-hidden"
        aria-hidden
      />

      <AnimatePresence>
        {viewerIndex !== null && (
          <MuralTimelineViewer
            items={timelineItems}
            initialIndex={viewerIndex}
            dominantColor={dominantColor}
            onClose={() => setViewerIndex(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
