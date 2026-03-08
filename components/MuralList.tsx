"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Mural } from "@/types/mural";

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

const ROW_HEIGHT_PX = 72;
const LIST_MAX_HEIGHT = "calc(55vh - 56px)";
const SIDEBAR_WIDTH = "min(380px, 85vw)";

interface MuralListProps {
  murals: Mural[];
  isOpen: boolean;
  onClose: () => void;
  onSelectMural: (mural: Mural) => void;
  /** When in tour mode, e.g. "Tour: 18th St Highlights — 5 stops". */
  listTitle?: string;
}

export function MuralList({
  murals,
  isOpen,
  onClose,
  onSelectMural,
  listTitle,
}: MuralListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const variants = isDesktop ? SIDEBAR : SHEET;

  useFocusTrap(dialogRef, isOpen);

  const virtualizer = useVirtualizer({
    count: murals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 5,
    getItemKey: (index) => murals[index].id,
  });

  const handleSelect = (mural: Mural) => {
    onSelectMural(mural);
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
            aria-label="Browse murals"
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
                {listTitle ?? "Browse murals"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                aria-label="Close mural list"
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
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto p-2"
              style={isDesktop ? undefined : { maxHeight: LIST_MAX_HEIGHT }}
            >
              <ul
                role="list"
                aria-label="Mural list"
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  position: "relative",
                  width: "100%",
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const mural = murals[virtualRow.index];
                  const stopNumber = listTitle ? virtualRow.index + 1 : null;
                  const ariaLabel = stopNumber
                    ? `Stop ${stopNumber}: View ${mural.title} by ${mural.artist}`
                    : `View ${mural.title} by ${mural.artist}`;
                  return (
                    <li
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(mural)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
                        aria-label={ariaLabel}
                      >
                        <div
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
                          style={{
                            boxShadow: `0 0 12px 2px ${mural.dominantColor}30`,
                          }}
                        >
                          {stopNumber != null && (
                            <span
                              className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white shadow-sm"
                              aria-hidden
                            >
                              {stopNumber}
                            </span>
                          )}
                          <img
                            src={mural.thumbnail ?? mural.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            width={56}
                            height={56}
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-900">
                            {mural.title}
                          </p>
                          <p className="truncate text-sm text-zinc-600">
                            {mural.artist}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
