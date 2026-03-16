import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TourList } from "../TourList";
import { MuraldexView } from "../MuraldexView";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: () => { },
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    nudge: vi.fn(),
    tap: vi.fn(),
  }),
}));

vi.mock("@/store/tourStore", () => ({
  useTourStore: (sel: (s: { setActiveTour: () => void }) => unknown) =>
    sel({ setActiveTour: vi.fn() }),
}));

vi.mock("@/store/captureStore", () => ({
  useCaptureStore: (sel: (s: { hasCaptured: (id: string) => boolean; getCaptureFor: (id: string) => null }) => unknown) =>
    sel({
      hasCaptured: () => false,
      getCaptureFor: () => null,
    }),
}));

vi.mock("@/store/locationStore", () => ({
  useLocationStore: (sel: (s: { userCoords: null }) => unknown) =>
    sel({ userCoords: null }),
}));

const mockCollections = [
  {
    id: "tour-1",
    name: "Test Tour",
    description: "A test",
    muralIds: ["mural-1", "mural-2"],
    estimatedMinutes: 20,
  },
];

const mockMurals = [
  {
    id: "mural-1",
    title: "Mural One",
    artist: "Artist",
    imageUrl: "/img1.webp",
    thumbnail: "/thumb1.webp",
    coordinates: [-87.65, 41.85],
  },
];

describe("TourList drawer", () => {
  it("renders grabber handle when open on mobile", () => {
    render(
      <TourList
        collections={mockCollections}
        isOpen={true}
        onClose={() => { }}
      />
    );
    const dialog = screen.getByRole("dialog", { name: "Walking tours" });
    expect(dialog).toBeInTheDocument();
    const handle = dialog.querySelector(".rounded-full.bg-zinc-300");
    expect(handle).toBeInTheDocument();
  });

  it("uses shared mobile sheet base styles (rounded-t-3xl)", () => {
    render(
      <TourList
        collections={mockCollections}
        isOpen={true}
        onClose={() => { }}
      />
    );
    const dialog = screen.getByRole("dialog", { name: "Walking tours" });
    expect(dialog.className).toContain("rounded-t-3xl");
  });
});

describe("MuraldexView drawer", () => {
  it("renders grabber handle when open on mobile", () => {
    render(
      <MuraldexView
        murals={mockMurals}
        isOpen={true}
        onClose={() => { }}
        onSelectMural={() => { }}
      />
    );
    const dialog = screen.getByRole("dialog", {
      name: "Muraldex — collection progress",
    });
    expect(dialog).toBeInTheDocument();
    const handle = dialog.querySelector(".rounded-full.bg-zinc-300");
    expect(handle).toBeInTheDocument();
  });

  it("uses shared mobile sheet base styles (rounded-t-3xl)", () => {
    render(
      <MuraldexView
        murals={mockMurals}
        isOpen={true}
        onClose={() => { }}
        onSelectMural={() => { }}
      />
    );
    const dialog = screen.getByRole("dialog", {
      name: "Muraldex — collection progress",
    });
    expect(dialog.className).toContain("rounded-t-3xl");
  });
});
