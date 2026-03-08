"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useTourStore } from "@/store/tourStore";
import type { Collection } from "@/types/collection";

const SHEET = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

const SIDEBAR = {
  hidden: { opacity: 0, x: "-100%" },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: "-100%" },
};

const SIDEBAR_WIDTH = "min(380px, 85vw)";

interface TourListProps {
  collections: Collection[];
  isOpen: boolean;
  onClose: () => void;
}

export function TourList({
  collections,
  isOpen,
  onClose,
}: TourListProps) {
  const setActiveTour = useTourStore((s) => s.setActiveTour);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const variants = isDesktop ? SIDEBAR : SHEET;

  useFocusTrap(dialogRef, isOpen);

  const handleSelectTour = (tour: Collection) => {
    setActiveTour(tour);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            role="presentation"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Walking tours"
            className="safe-bottom fixed z-50 flex flex-col overflow-hidden border-zinc-200 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)] bottom-0 left-0 right-0 max-h-[55vh] rounded-t-3xl border-t border-zinc-100 md:left-0 md:right-auto md:top-0 md:bottom-0 md:max-h-none md:w-full md:max-w-[380px] md:rounded-r-2xl md:rounded-tl-none md:rounded-t-2xl md:border-l md:border-t-0"
            style={isDesktop ? { width: SIDEBAR_WIDTH } : undefined}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex justify-center pt-3 pb-1 md:hidden"
              aria-hidden
            >
              <span className="h-1.5 w-12 shrink-0 rounded-full bg-zinc-300" aria-hidden />
            </div>
            <div className="sticky top-0 flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
              <h2 className="text-lg font-semibold text-zinc-900">
                Walking tours
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                aria-label="Close walking tours"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-4"
              style={isDesktop ? undefined : { maxHeight: "calc(50vh - 56px)" }}
            >
              <p
                className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                role="status"
                aria-live="polite"
              >
                This section is a work in progress.
              </p>
              <ul
                role="list"
                aria-label="Tour list"
                className="flex flex-col gap-3 list-none m-0 p-0"
              >
                {collections.map((tour) => (
                  <li key={tour.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectTour(tour)}
                      className="flex w-full flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-zinc-50 hover:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                      aria-label={`Start tour: ${tour.name}, ${tour.muralIds.length} murals`}
                    >
                      <span className="font-semibold text-zinc-900">
                        {tour.name}
                      </span>
                      {tour.description && (
                        <span className="text-sm text-zinc-600 line-clamp-2">
                          {tour.description}
                        </span>
                      )}
                      <span className="text-sm text-zinc-500">
                        {tour.muralIds.length} mural{tour.muralIds.length !== 1 ? "s" : ""}
                        {tour.estimatedMinutes != null &&
                          ` · ~${tour.estimatedMinutes} min`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
