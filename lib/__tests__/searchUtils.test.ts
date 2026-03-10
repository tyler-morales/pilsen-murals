import { describe, it, expect } from "vitest";
import { groupByMuralId } from "../searchUtils";

describe("groupByMuralId", () => {
  it("deduplicates by payload.id and keeps best score per mural", () => {
    const points = [
      { id: 1, score: 0.9, payload: { id: "mural-1", title: "A" } },
      { id: 2, score: 0.7, payload: { id: "mural-1", title: "A" } },
      { id: 3, score: 0.85, payload: { id: "mural-2", title: "B" } },
    ];
    const out = groupByMuralId(points, 5);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: "mural-1", score: 0.9, payload: { id: "mural-1", title: "A" } });
    expect(out[1]).toEqual({ id: "mural-2", score: 0.85, payload: { id: "mural-2", title: "B" } });
  });

  it("returns at most topK results", () => {
    const points = [
      { id: "mural-1", score: 0.9, payload: {} },
      { id: "mural-2", score: 0.8, payload: {} },
      { id: "mural-3", score: 0.7, payload: {} },
    ];
    const out = groupByMuralId(points, 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id)).toEqual(["mural-1", "mural-2"]);
  });

  it("uses point.id when payload.id is missing", () => {
    const points = [
      { id: 42, score: 0.9, payload: { title: "X" } },
    ];
    const out = groupByMuralId(points, 3);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("42");
  });
});
