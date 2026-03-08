"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusables(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });
}

/**
 * Traps focus inside a dialog container and restores focus to the previously
 * focused element when the dialog closes. Call with the dialog's container ref
 * and open state.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean
): void {
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // On open: capture previous focus, move focus to first focusable in container
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusables = getFocusables(container);
    const first = focusables[0];
    if (first) {
      const raf = requestAnimationFrame(() => {
        first.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, containerRef]);

  // Trap Tab / Shift+Tab inside container
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const container = containerRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusables(container);
      if (focusables.length === 0) return;
      const current = document.activeElement as HTMLElement;
      const currentIndex = focusables.indexOf(current);
      if (currentIndex === -1) return;
      if (e.shiftKey) {
        if (currentIndex === 0) {
          e.preventDefault();
          focusables[focusables.length - 1].focus();
        }
      } else {
        if (currentIndex === focusables.length - 1) {
          e.preventDefault();
          focusables[0].focus();
        }
      }
    };
    container.addEventListener("keydown", onKeyDown, true);
    return () => container.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, containerRef]);

  // On close: restore focus only when transitioning from open to closed
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const prev = previousActiveRef.current;
    if (prev && typeof prev.focus === "function" && document.contains(prev)) {
      previousActiveRef.current = null;
      prev.focus();
    }
  }, [isOpen]);
}
