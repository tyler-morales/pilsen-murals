"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useHaptics } from "@/hooks/useHaptics";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { CaptureRecord } from "@/store/captureStore";
import { computeRarity, type Rarity } from "@/lib/rarity";
import { formatDistance } from "@/lib/geo";
import type { Mural } from "@/types/mural";

interface CaptureRevealAnimationProps {
  mural: Mural;
  capture: CaptureRecord;
  onDismiss: () => void;
}

const RARITY_LABELS: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

function drawConfetti(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dominantColor: string
) {
  const particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    life: number;
  }> = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const palette = [
    dominantColor,
    "#f59e0b",
    "#ef4444",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
  ];
  for (let i = 0; i < 80; i++) {
    const angle = (Math.PI * 2 * i) / 80 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 4 + Math.random() * 8,
      color: palette[Math.floor(Math.random() * palette.length)] ?? dominantColor,
      life: 1,
    });
  }
  let rafId: number;
  const tick = () => {
    ctx.clearRect(0, 0, width, height);
    let anyAlive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.life -= 0.012;
      if (p.life <= 0) continue;
      anyAlive = true;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (anyAlive) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

export function CaptureRevealAnimation({
  mural,
  capture,
  onDismiss,
}: CaptureRevealAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const haptics = useHaptics();
  const reducedMotion = usePrefersReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const hasSuccessRef = useRef(false);
  const hasPulseRef = useRef(false);

  const rarity = computeRarity(mural);
  const captureDate = capture.capturedAt
    ? new Date(capture.capturedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : null;
  const distanceText =
    capture.distanceMeters != null
      ? formatDistance(capture.distanceMeters)
      : null;

  useEffect(() => {
    if (reducedMotion) return;
    if (!hasSuccessRef.current) {
      hasSuccessRef.current = true;
      haptics.success();
    }
  }, [haptics, reducedMotion]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFlipped(true);
      if (!hasPulseRef.current) {
        hasPulseRef.current = true;
        haptics.pulse();
      }
    }, reducedMotion ? 0 : 600);
    return () => clearTimeout(t);
  }, [haptics, reducedMotion]);

  useEffect(() => {
    if (!flipped || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const stop = drawConfetti(ctx, canvas.width, canvas.height, mural.dominantColor);
    return () => {
      window.removeEventListener("resize", resize);
      stop();
    };
  }, [flipped, reducedMotion, mural.dominantColor]);

  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const handleTap = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const duration = reducedMotion ? 0 : 0.5;
  const flipDuration = reducedMotion ? 0 : 0.6;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label="Mural captured"
      onClick={handleTap}
      onKeyDown={(e) => e.key === "Escape" && handleTap()}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />
      <div
        className="relative z-10 flex h-full w-full items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          className="relative h-[280px] w-[200px] cursor-pointer"
          style={{ perspective: 1200 }}
          initial={reducedMotion ? false : { scale: 0.3, opacity: 0, rotateZ: -12 }}
          animate={{ scale: 1, opacity: 1, rotateZ: 0 }}
          transition={{ duration, type: "spring", stiffness: 200, damping: 22 }}
          onClick={handleTap}
        >
          <motion.div
            className="absolute inset-0"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{
              duration: flipDuration,
              type: "tween",
              ease: "easeInOut",
            }}
          >
            <div
              className="absolute inset-0 rounded-2xl border-4 border-white shadow-2xl"
              style={{ backfaceVisibility: "hidden" }}
            >
              <img
                src={mural.thumbnail ?? mural.imageUrl}
                alt=""
                className="h-full w-full rounded-xl object-cover"
              />
            </div>
            <div
              className="absolute inset-0 flex flex-col justify-between rounded-2xl border-4 border-amber-400 bg-gradient-to-b from-amber-50 to-white p-3 shadow-2xl"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div>
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${rarity === "legendary"
                    ? "bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400 text-white"
                    : rarity === "rare"
                      ? "bg-amber-200 text-amber-900"
                      : rarity === "uncommon"
                        ? "bg-zinc-200 text-zinc-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                >
                  {RARITY_LABELS[rarity]}
                </span>
                <h3 className="mt-2 line-clamp-2 text-base font-bold text-zinc-900">
                  {mural.title}
                </h3>
                <p className="text-sm text-zinc-600">{mural.artist}</p>
              </div>
              <div className="text-xs text-zinc-500">
                {captureDate && <p>Captured {captureDate}</p>}
                {distanceText && <p>{distanceText}</p>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-zinc-700 transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={handleTap}
        aria-label="Close"
      >
        <span className="text-sm font-medium">Done</span>
      </button>
    </div>
  );
}
