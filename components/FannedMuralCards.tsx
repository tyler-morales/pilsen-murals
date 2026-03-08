"use client";

import { MuralMarker } from "./MuralMarker";
import type { Mural } from "@/types/mural";

const FAN_ANGLE_SPAN_DEG = 24;
const REVEAL_STAGGER_MS = 28;
const MARKER_CHUNK_SIZE = 8;

function getFanAngleDeg(index: number, total: number): number {
  if (total <= 1) return 0;
  const half = (FAN_ANGLE_SPAN_DEG / 2);
  const step = total > 1 ? (FAN_ANGLE_SPAN_DEG / (total - 1)) : 0;
  return -half + index * step;
}

interface FannedMuralCardsProps {
  murals: Mural[];
  zoom: number;
  onClick: (mural: Mural) => void;
  prefersReducedMotion: boolean;
  nearbyMuralId: string | null;
}

/**
 * Renders multiple mural cards in a fanned deck layout (like a hand of cards).
 * Each card is rotated and stacked with the rightmost card on top.
 */
export function FannedMuralCards({
  murals,
  zoom,
  onClick,
  prefersReducedMotion,
  nearbyMuralId,
}: FannedMuralCardsProps) {
  return (
    <div
      className="relative flex items-end justify-center overflow-visible"
      style={{ minWidth: 200, minHeight: 120 }}
      aria-hidden
    >
      {murals.map((mural, i) => {
        const fanAngle = getFanAngleDeg(i, murals.length);
        const revealDelay = (i % MARKER_CHUNK_SIZE) * REVEAL_STAGGER_MS;
        return (
          <div
            key={mural.id}
            className="absolute bottom-0 left-1/2 origin-bottom"
            style={{
              transform: `translateX(-50%) rotate(${fanAngle}deg)`,
              zIndex: i,
            }}
          >
            <MuralMarker
              mural={mural}
              zoom={zoom}
              onClick={onClick}
              revealDelay={revealDelay}
              prefersReducedMotion={prefersReducedMotion}
              isNearby={mural.id === nearbyMuralId}
            />
          </div>
        );
      })}
    </div>
  );
}
