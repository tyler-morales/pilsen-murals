import { describe, it, expect } from "vitest";
import { bucketResultsByMuralId } from "../searchUtils";

describe("bucketResultsByMuralId", () => {
  it("buckets results by id and sorts items by score desc", () => {
    const results = [
      { id: "mural-1", score: 0.7, payload: {} },
      { id: "mural-1", score: 0.9, payload: {} },
      { id: "mural-2", score: 0.8, payload: {} },
    ];
    const out = bucketResultsByMuralId(results);
    expect(out).toHaveLength(2);
    expect(out[0].muralId).toBe("mural-1");
    expect(out[0].items.map((i) => i.score)).toEqual([0.9, 0.7]);
    expect(out[1].muralId).toBe("mural-2");
    expect(out[1].items).toHaveLength(1);
  });

  it("sorts buckets by best score in bucket", () => {
    const results = [
      { id: "mural-b", score: 0.75, payload: {} },
      { id: "mural-a", score: 0.9, payload: {} },
      { id: "mural-c", score: 0.8, payload: {} },
    ];
    const out = bucketResultsByMuralId(results);
    expect(out.map((b) => b.muralId)).toEqual(["mural-a", "mural-c", "mural-b"]);
  });

  it("respects maxBuckets", () => {
    const results = [
      { id: "mural-1", score: 0.9, payload: {} },
      { id: "mural-2", score: 0.8, payload: {} },
      { id: "mural-3", score: 0.7, payload: {} },
    ];
    const out = bucketResultsByMuralId(results, { maxBuckets: 2 });
    expect(out).toHaveLength(2);
    expect(out.map((b) => b.muralId)).toEqual(["mural-1", "mural-2"]);
  });
});
