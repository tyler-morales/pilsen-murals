"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { RotateCcw, RotateCw } from "lucide-react";
import { getCroppedImg } from "@/lib/upload/cropImage";
import "react-easy-crop/react-easy-crop.css";

interface ImageEditorProps {
  imageUrl: string;
  onComplete: (blob: Blob) => void;
  onBack: () => void;
}

const ROTATION_STEP = 90;

export function ImageEditor({ imageUrl, onComplete, onBack }: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [donePending, setDonePending] = useState(false);

  const onCropAreaChange = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleRotateLeft = useCallback(() => {
    setRotation((r) => (r - ROTATION_STEP + 360) % 360);
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((r) => (r + ROTATION_STEP) % 360);
  }, []);

  const handleDone = useCallback(async () => {
    if (croppedAreaPixels == null) return;
    setDonePending(true);
    try {
      const blob = await getCroppedImg(imageUrl, croppedAreaPixels, rotation);
      onComplete(blob);
    } catch {
      setDonePending(false);
    }
  }, [imageUrl, croppedAreaPixels, rotation, onComplete]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        Adjust the crop and rotation, then tap Done to continue.
      </p>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={4 / 3}
          minZoom={1}
          maxZoom={4}
          cropShape="rect"
          objectFit="contain"
          showGrid={false}
          style={{
            containerStyle: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
            mediaStyle: {},
            cropAreaStyle: {},
          }}
          classes={{
            containerClassName: "",
            mediaClassName: "",
            cropAreaClassName: "",
          }}
          restrictPosition={true}
          mediaProps={{}}
          cropperProps={{}}
          zoomSpeed={1.2}
          zoomWithScroll={true}
          keyboardStep={8}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropAreaChange={onCropAreaChange}
          onCropComplete={onCropComplete}
        />
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
            disabled={croppedAreaPixels == null || donePending}
            className="min-h-[44px] rounded-xl border-2 border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Done — use this image"
          >
            {donePending ? "Processing…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
