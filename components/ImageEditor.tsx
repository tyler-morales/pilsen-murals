"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import { Loader2, RotateCcw, RotateCw } from "lucide-react";
import { getCroppedImg, rotateImage } from "@/lib/upload/cropImage";
import type { PixelCrop } from "@/lib/upload/cropImage";
import "react-image-crop/dist/ReactCrop.css";

interface ImageEditorProps {
  imageUrl: string;
  onComplete: (blob: Blob) => void;
  onBack: () => void;
}

const ROTATION_STEP = 90;

export function ImageEditor({ imageUrl, onComplete, onBack }: ImageEditorProps) {
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [donePending, setDonePending] = useState(false);
  const [displaySize, setDisplaySize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
  const rotatedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentImageUrl(imageUrl);
    setCrop(undefined);
    setDisplaySize(null);
    setNaturalSize(null);
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (rotatedUrlRef.current) {
        URL.revokeObjectURL(rotatedUrlRef.current);
        rotatedUrlRef.current = null;
      }
    };
  }, []);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      const width = e.currentTarget.clientWidth;
      const height = e.currentTarget.clientHeight;
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
      setDisplaySize({ width, height });
      setCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    },
    []
  );

  const handleRotateLeft = useCallback(async () => {
    try {
      const newUrl = await rotateImage(currentImageUrl, -ROTATION_STEP);
      if (rotatedUrlRef.current) {
        URL.revokeObjectURL(rotatedUrlRef.current);
      }
      rotatedUrlRef.current = newUrl;
      setCurrentImageUrl(newUrl);
      setCrop(undefined);
      setDisplaySize(null);
      setNaturalSize(null);
    } catch {
      // ignore rotation failure
    }
  }, [currentImageUrl]);

  const handleRotateRight = useCallback(async () => {
    try {
      const newUrl = await rotateImage(currentImageUrl, ROTATION_STEP);
      if (rotatedUrlRef.current) {
        URL.revokeObjectURL(rotatedUrlRef.current);
      }
      rotatedUrlRef.current = newUrl;
      setCurrentImageUrl(newUrl);
      setCrop(undefined);
      setDisplaySize(null);
      setNaturalSize(null);
    } catch {
      // ignore rotation failure
    }
  }, [currentImageUrl]);

  const handleDone = useCallback(async () => {
    if (crop == null || displaySize == null || naturalSize == null) return;
    setDonePending(true);
    try {
      let pixelCrop: PixelCrop;
      if (crop.unit === "px") {
        const scaleX = naturalSize.width / displaySize.width;
        const scaleY = naturalSize.height / displaySize.height;
        pixelCrop = {
          x: crop.x * scaleX,
          y: crop.y * scaleY,
          width: crop.width * scaleX,
          height: crop.height * scaleY,
        };
      } else {
        pixelCrop = {
          x: (crop.x / 100) * naturalSize.width,
          y: (crop.y / 100) * naturalSize.height,
          width: (crop.width / 100) * naturalSize.width,
          height: (crop.height / 100) * naturalSize.height,
        };
      }
      const blob = await getCroppedImg(currentImageUrl, pixelCrop);
      onComplete(blob);
    } catch {
      setDonePending(false);
    }
  }, [
    crop,
    currentImageUrl,
    displaySize,
    naturalSize,
    onComplete,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        Drag the corners to adjust the crop area, then tap Done to continue.
      </p>
      <div className="relative max-h-[60vh] w-full overflow-hidden rounded-xl bg-zinc-100">
        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          className="max-h-[60vh]"
          style={{ maxHeight: "60vh" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ReactCrop requires a native img element */}
          <img
            src={currentImageUrl}
            alt="Crop this image"
            style={{ maxHeight: "60vh", width: "100%", objectFit: "contain" }}
            onLoad={onImageLoad}
          />
        </ReactCrop>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={handleRotateLeft}
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
            aria-label="Rotate left"
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleRotateRight}
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
            aria-label="Rotate right"
          >
            <RotateCw className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
            aria-label="Back to camera"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={crop == null || donePending}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={donePending ? "Processing image" : "Done — use this image"}
          >
            {donePending ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                Processing…
              </>
            ) : (
              "Done"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
