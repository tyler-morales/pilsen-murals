import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mural } from "@/types/mural";
import { fixtureMural } from "@/test/fixtures/mural";

vi.mock("next/image", () => ({
  default: ({
    alt,
    _fill,
    _priority,
    _sizes,
    _quality,
    _placeholder,
    _blurDataURL,
    _loader,
    _unoptimized,
    _overrideSrc,
    ...props
  }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element -- Test mock for Image component
    <img alt={alt as string} {...props} />
  ),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const Component = React.forwardRef(
          (
            {
              children,
              _initial,
              _animate,
              _exit,
              _variants,
              _transition,
              _whileHover,
              _whileTap,
              _whileDrag,
              _whileInView,
              _drag,
              _dragConstraints,
              _dragControls,
              _dragElastic,
              _dragListener,
              _onAnimationComplete,
              _onDragEnd,
              _onDrag,
              _onDragStart,
              _layout,
              _layoutId,
              ...props
            }: Record<string, unknown>,
            ref: React.Ref<unknown>
          ) =>
            React.createElement(tag, { ...props, ref }, children as React.ReactNode)
        );
        Component.displayName = `motion.${tag}`;
        return Component;
      },
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
    tap: vi.fn(),
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

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/store/captureStore", () => ({
  useCaptureStore: vi.fn(),
}));

import { useMuralStore } from "@/store/muralStore";
import { useAuthStore } from "@/store/authStore";
import { useCaptureStore } from "@/store/captureStore";
import { MuralModal } from "../MuralModal";

function mockAuthStore(user: { id: string } | null) {
  vi.mocked(useAuthStore).mockImplementation((selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user }) as ReturnType<typeof useAuthStore>
  );
}

function createCaptureStoreMock(overrides: { addCapture?: () => void; hasCaptured?: (id: string) => boolean } = {}) {
  const addCapture = overrides.addCapture ?? vi.fn();
  const hasCaptured = overrides.hasCaptured ?? vi.fn(() => false);
  return (selector: (s: unknown) => unknown) =>
    selector({
      captures: [],
      supabaseClient: null,
      addCapture,
      hasCaptured,
      getCaptureFor: vi.fn(),
      setSupabaseClient: vi.fn(),
      syncLocalCapturesToServer: vi.fn(),
      loadServerCaptures: vi.fn(),
    });
}

describe("MuralModal edit copy", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-site-key";
    mockAuthStore(null);
    vi.mocked(useCaptureStore).mockImplementation(createCaptureStoreMock());
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

describe("MuralModal star (save to account)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-site-key";
    vi.mocked(useCaptureStore).mockImplementation(createCaptureStoreMock());
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
    vi.mocked(useCaptureStore).mockReturnValue({
      captures: [],
      supabaseClient: null,
      addCapture: vi.fn(),
      hasCaptured: vi.fn(() => false),
      getCaptureFor: vi.fn(),
      setSupabaseClient: vi.fn(),
      syncLocalCapturesToServer: vi.fn(),
      loadServerCaptures: vi.fn(),
    } as unknown as ReturnType<typeof useCaptureStore>);
  });

  it("calls onRequestAuth with save message when star clicked and user not logged in", async () => {
    const user = userEvent.setup();
    mockAuthStore(null);
    const addCapture = vi.fn();
    vi.mocked(useCaptureStore).mockImplementation(createCaptureStoreMock({ addCapture }));
    const onRequestAuth = vi.fn();

    render(<MuralModal onRequestAuth={onRequestAuth} />);

    const starBtn = screen.getByRole("button", { name: "Save mural to your account" });
    await user.click(starBtn);

    expect(onRequestAuth).toHaveBeenCalledTimes(1);
    expect(onRequestAuth).toHaveBeenCalledWith("Sign in", "Create an account to save this mural to your account.");
    expect(addCapture).not.toHaveBeenCalled();
  });

  it("calls addCapture when star clicked and user is logged in", async () => {
    const user = userEvent.setup();
    mockAuthStore({ id: "user-1" });
    const addCapture = vi.fn();
    vi.mocked(useCaptureStore).mockImplementation(createCaptureStoreMock({ addCapture }));

    render(<MuralModal />);

    const starBtn = screen.getByRole("button", { name: "Save mural to your account" });
    await user.click(starBtn);

    expect(addCapture).toHaveBeenCalledTimes(1);
    expect(addCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        muralId: fixtureMural.id,
        capturedAt: expect.any(String),
      })
    );
  });
});
