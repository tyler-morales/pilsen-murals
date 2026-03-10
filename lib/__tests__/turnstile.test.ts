import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "../turnstile";

describe("verifyTurnstile", () => {
  const originalEnv = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns success when siteverify returns success: true", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const result = await verifyTurnstile("valid-token");

    expect(result.success).toBe(true);
    expect(result.errorCodes).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "test-secret", response: "valid-token" }),
      })
    );
  });

  it("includes remoteip in body when provided", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstile("token", "192.168.1.1");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          secret: "test-secret",
          response: "token",
          remoteip: "192.168.1.1",
        }),
      })
    );
  });

  it("returns failure when siteverify returns success: false with error-codes", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: false,
          "error-codes": ["timeout-or-duplicate"],
        }),
    });

    const result = await verifyTurnstile("bad-token");

    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["timeout-or-duplicate"]);
  });

  it("throws when TURNSTILE_SECRET_KEY is not set", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const callCountBefore = mockFetch.mock.calls.length;

    await expect(verifyTurnstile("token")).rejects.toThrow(
      "TURNSTILE_SECRET_KEY is not set"
    );

    expect(mockFetch.mock.calls.length).toBe(callCountBefore);
  });
});
