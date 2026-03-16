import { describe, it, expect } from "vitest";
import {
  groupLeavesIntoPlacements,
  groupLeavesIntoStackedPlacements,
  getFanoutScreenOffsets,
  muralToPoint,
  spreadOverlappingPlacements,
  type Placement,
} from "../markerPlacement";
import type { Mural } from "@/types/mural";

const muralA: Mural = {
  id: "mural-a",
  title: "A",
  artist: "Artist A",
  coordinates: [-87.65, 41.85],
  dominantColor: "#333",
  imageUrl: "/a.jpg",
};

const muralB: Mural = {
  id: "mural-b",
  title: "B",
  artist: "Artist B",
  coordinates: [-87.66, 41.86],
  dominantColor: "#444",
  imageUrl: "/b.jpg",
};

describe("muralToPoint", () => {
  it("returns GeoJSON Point with muralId in properties", () => {
    const f = muralToPoint(muralA);
    expect(f.type).toBe("Feature");
    expect(f.geometry.type).toBe("Point");
    expect(f.geometry.coordinates).toEqual([-87.65, 41.85]);
    expect(f.properties.muralId).toBe("mural-a");
  });
});

describe("groupLeavesIntoPlacements", () => {
  it("returns empty array for empty leaves", () => {
    expect(groupLeavesIntoPlacements([])).toEqual([]);
  });

  it("returns one placement per leaf with center from coordinates", () => {
    const leaves = [
      { mural: muralA, coordinates: muralA.coordinates },
      { mural: muralB, coordinates: muralB.coordinates },
    ];
    const placements = groupLeavesIntoPlacements(leaves);
    expect(placements).toHaveLength(2);
    expect(placements[0]).toEqual({ center: [-87.65, 41.85], murals: [muralA] });
    expect(placements[1]).toEqual({ center: [-87.66, 41.86], murals: [muralB] });
  });
});

describe("spreadOverlappingPlacements", () => {
  it("does not mutate placements when all centers are unique", () => {
    const placements: Placement[] = [
      { center: [-87.65, 41.85], murals: [muralA] },
      { center: [-87.66, 41.86], murals: [muralB] },
    ];
    const project = (c: [number, number]) => ({ x: c[0] * 100, y: c[1] * 100 });
    const unproject = (p: { x: number; y: number }) => [p.x / 100, p.y / 100] as [number, number];
    spreadOverlappingPlacements(placements, project, unproject, 55);
    expect(placements[0].center).toEqual([-87.65, 41.85]);
    expect(placements[1].center).toEqual([-87.66, 41.86]);
  });

  it("spreads placements with same center into circle", () => {
    const center: [number, number] = [-87.65, 41.85];
    const placements: Placement[] = [
      { center: [...center], murals: [muralA] },
      { center: [...center], murals: [muralB] },
    ];
    const project = (c: [number, number]) => ({ x: c[0] * 100, y: c[1] * 100 });
    const unproject = (p: { x: number; y: number }) => [p.x / 100, p.y / 100] as [number, number];
    spreadOverlappingPlacements(placements, project, unproject, 55);
    expect(placements[0].center).not.toEqual(placements[1].center);
    const dist0 = Math.hypot(
      placements[0].center[0] - center[0],
      placements[0].center[1] - center[1]
    );
    const dist1 = Math.hypot(
      placements[1].center[0] - center[0],
      placements[1].center[1] - center[1]
    );
    expect(dist0).toBeGreaterThan(0);
    expect(dist1).toBeGreaterThan(0);
  });
});

describe("groupLeavesIntoStackedPlacements", () => {
  const project = (c: [number, number]) => ({ x: c[0] * 100, y: c[1] * 100 });
  const unproject = (p: { x: number; y: number }) =>
    [p.x / 100, p.y / 100] as [number, number];

  it("returns empty array for empty leaves", () => {
    expect(groupLeavesIntoStackedPlacements([], project, unproject)).toEqual([]);
  });

  it("returns one placement with one mural when single leaf", () => {
    const leaves = [{ mural: muralA, coordinates: muralA.coordinates }];
    const placements = groupLeavesIntoStackedPlacements(leaves, project, unproject);
    expect(placements).toHaveLength(1);
    expect(placements[0].center).toEqual([-87.65, 41.85]);
    expect(placements[0].murals).toHaveLength(1);
    expect(placements[0].murals[0]).toEqual(muralA);
  });

  it("stacks leaves with same center into one placement with multiple murals", () => {
    const center: [number, number] = [-87.65, 41.85];
    const leaves = [
      { mural: muralA, coordinates: center },
      { mural: muralB, coordinates: [...center] },
    ];
    const placements = groupLeavesIntoStackedPlacements(leaves, project, unproject);
    expect(placements).toHaveLength(1);
    expect(placements[0].murals).toHaveLength(2);
    expect(placements[0].center).toEqual(center);
    expect(placements[0].murals.map((m) => m.id)).toContain("mural-a");
    expect(placements[0].murals.map((m) => m.id)).toContain("mural-b");
  });

  it("returns two placements when leaves have different centers", () => {
    const leaves = [
      { mural: muralA, coordinates: muralA.coordinates },
      { mural: muralB, coordinates: muralB.coordinates },
    ];
    const placements = groupLeavesIntoStackedPlacements(leaves, project, unproject);
    expect(placements).toHaveLength(2);
    expect(placements[0].murals).toHaveLength(1);
    expect(placements[1].murals).toHaveLength(1);
  });
});

describe("getFanoutScreenOffsets", () => {
  it("returns single origin offset when count is 1", () => {
    const offsets = getFanoutScreenOffsets(1, 60);
    expect(offsets).toHaveLength(1);
    expect(offsets[0]).toEqual({ x: 0, y: 0 });
  });

  it("returns n points on a circle when count > 1", () => {
    const radius = 55;
    const offsets = getFanoutScreenOffsets(3, radius);
    expect(offsets).toHaveLength(3);
    offsets.forEach(({ x, y }) => {
      const dist = Math.hypot(x, y);
      expect(Math.abs(dist - radius)).toBeLessThan(2);
    });
  });

  it("no fanout when radius 0", () => {
    const offsets = getFanoutScreenOffsets(2, 0);
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toEqual({ x: 0, y: 0 });
    expect(offsets[1]).toEqual({ x: 0, y: 0 });
  });
});
