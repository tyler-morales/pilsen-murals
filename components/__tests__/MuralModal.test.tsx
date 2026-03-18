import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mural } from "@/types/mural";
import { fixtureMural } from "@/test/fixtures/mural";

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    }
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDragControls: () => ({ start: vi.fn() }),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: vi.fn(() => true),
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: vi.fn(() => ({
    tapMedium: vi.fn(),
    nudge: vi.fn(),
    toggle: vi.fn(),
  })),
}));

vi.mock("@/lib/directions", () => ({
  getDirectionsUrl: vi.fn(() => "https://maps.example.com"),
}));

vi.mock("@/store/mapStore", () => ({
  useMapStore: vi.fn((selector: (state: { mapStyle: "standard" | "satellite" }) => unknown) =>
    selector({ mapStyle: "standard" })
  ),
}));

vi.mock("@/store/locationStore", () => {
  const store = vi.fn();
  (store as unknown as { getState: () => { userCoords: null } }).getState = () => ({
    userCoords: null,
  });
  return { useLocationStore: store };
});

vi.mock("@/store/muralStore", () => ({
  useMuralStore: vi.fn(),
}));

import { useMuralStore } from "@/store/muralStore";
import { MuralModal } from "../MuralModal";

describe("MuralModal edit copy", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-site-key";
    vi.mocked(useMuralStore).mockReturnValue({
      activeMural: fixtureMural as Mural,
      isModalOpen: true,
      closeModal: vi.fn(),
      muralsOrder: [fixtureMural as Mural],
      activeIndex: 0,
      goPrev: vi.fn(),
      goNext: vi.fn(),
      goToIndex: vi.fn(),
      requestFlyTo: vi.fn(),
      updateActiveMural: vi.fn(),
      pendingFlyTo: null,
      openModal: vi.fn(),
      clearPendingFlyTo: vi.fn(),
    });
  });

  it("shows clear Instagram-only guidance in edit mode", async () => {
    const user = userEvent.setup();
    render(<MuralModal />);

    await user.click(screen.getByRole("button", { name: "Edit mural details" }));

    expect(screen.getByLabelText("Artist Instagram username")).toHaveAttribute(
      "placeholder",
      "username (no @ needed)"
    );
    expect(screen.getByText("Instagram username (optional)")).toBeInTheDocument();
    expect(
      screen.getByText("Instagram only for now. If you paste @username, we'll clean it up.")
    ).toBeInTheDocument();
  });
});
