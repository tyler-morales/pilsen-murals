/**
 * Shared primitives for mobile bottom-sheet drawers (Murals tab, Tours tab, etc.).
 * Single source for close-threshold logic and consistent shell/handle styling.
 */

/** Drag distance (px) downward that triggers close. */
export const DRAWER_CLOSE_OFFSET_THRESHOLD = 80;

/** Drag velocity (px/s) downward that triggers close. */
export const DRAWER_CLOSE_VELOCITY_THRESHOLD = 300;

export interface DrawerDragEndInfo {
  offset: { y: number };
  velocity: { y: number };
}

/**
 * Returns true when the user has dragged far enough or fast enough downward to close the drawer.
 */
export function shouldCloseDrawerOnDragEnd(info: DrawerDragEndInfo): boolean {
  return (
    info.offset.y > DRAWER_CLOSE_OFFSET_THRESHOLD ||
    info.velocity.y > DRAWER_CLOSE_VELOCITY_THRESHOLD
  );
}

/** Shared mobile sheet container base (position, radius, border, shadow, max height). */
export const MOBILE_SHEET_BASE_CLASSES =
  "safe-bottom fixed z-50 flex flex-col overflow-hidden border-zinc-200 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)] bottom-0 left-0 right-0 max-h-[85vh] rounded-t-3xl border-t touch-pan-y";

/** Drag handle row: 44px hit area, centered pill, touch-none for smooth drag. */
export const DRAG_HANDLE_ROW_CLASSES =
  "flex min-h-[44px] cursor-grab active:cursor-grabbing flex-col items-center justify-center pt-3 pb-1 touch-none md:cursor-default md:min-h-0 md:pt-0 md:pb-0";

/** Framer Motion drag config for mobile-only drawer dismiss (handle-only start). */
export const DRAWER_DRAG_PROPS = {
  drag: "y" as const,
  dragConstraints: { top: 0 },
  dragElastic: { top: 0.05, bottom: 0.4 },
  dragListener: false,
  dragTransition: { bounceStiffness: 300, bounceDamping: 30 },
};
