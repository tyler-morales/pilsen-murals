"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import { useHaptics } from "@/hooks/useHaptics";
import type { TimelinePhoto } from "@/components/MuralTimeline";
import { X } from "lucide-react";

interface MuralTimelineViewerProps {
  items: TimelinePhoto[];
  initialIndex: number;
  dominantColor: string;
  onClose: () => void;
}

export function MuralTimelineViewer({
  items,
  initialIndex,
  dominantColor,
  onClose,
}: MuralTimelineViewerProps) {
  const haptics = useHaptics();

  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: initialIndex,
    loop: false,
    align: "center",
  });

  useEffect(() => {
    if (emblaApi && initialIndex >= 0) {
      emblaApi.scrollTo(initialIndex, true);
    }
  }, [emblaApi, initialIndex]);

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
    haptics.tap();
  }, [emblaApi, haptics]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
    haptics.tap();
  }, [emblaApi, haptics]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        haptics.tapMedium();
        onClose();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollPrev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollNext();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, scrollPrev, scrollNext, haptics]);

  const handleBackdropClick = useCallback(() => {
    haptics.tapMedium();
    onClose();
  }, [onClose, haptics]);

  const total = items.length;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    return () => emblaApi.off("select", onSelect);
  }, [emblaApi]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Timeline photo viewer"
      className="safe-top safe-right safe-bottom safe-left fixed inset-0 z-[80] flex flex-col bg-black/90"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0"
        onClick={handleBackdropClick}
        aria-hidden
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          haptics.tapMedium();
          onClose();
        }}
        className="absolute right-4 top-4 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        aria-label="Close viewer"
      >
        <X className="h-6 w-6" aria-hidden />
      </button>

      <div
        ref={emblaRef}
        className="flex-1 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="region"
        aria-roledescription="carousel"
        aria-label="Timeline photos"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            scrollPrev();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            scrollNext();
          }
        }}
      >
        <div className="flex h-full flex-row">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="relative min-w-0 flex-[0_0_100%] flex flex-col items-center justify-center px-4 py-16"
              role="group"
              aria-roledescription="slide"
              aria-label={`Photo ${idx + 1} of ${total}: ${item.dateLabel}`}
            >
              <div className="relative h-[60vh] w-full max-w-4xl mx-auto">
                <Image
                  src={item.imageUrl}
                  alt={`Mural photo from ${item.dateLabel}`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  unoptimized={item.imageUrl.startsWith("http")}
                />
              </div>
              <div
                className="absolute bottom-8 left-0 right-0 flex justify-center px-4"
                style={{ color: dominantColor }}
              >
                <span className="rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                  {item.isOriginal ? "Original" : item.dateLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollPrev();
            }}
            className="absolute left-2 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:left-4"
            aria-label="Previous photo"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollNext();
            }}
            className="absolute right-2 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:right-4"
            aria-label="Next photo"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <div
            className="absolute bottom-4 left-0 right-0 z-10 flex justify-center gap-2"
            role="tablist"
            aria-label="Timeline position"
          >
            {items.map((_, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === selectedIndex}
                aria-label={`Go to photo ${idx + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  emblaApi?.scrollTo(idx);
                  haptics.tap();
                }}
                className={`h-2 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${idx === selectedIndex
                  ? "w-6 bg-white"
                  : "w-2 bg-white/50 hover:bg-white/70"
                  }`}
              />
            ))}
          </div>
        </>
      )}

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        Photo {selectedIndex + 1} of {total}: {items[selectedIndex]?.dateLabel}
      </div>
    </motion.div>
  );
}
