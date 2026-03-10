"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/** Cosine similarity threshold: score >= this means "mural is in DB". */
export const MATCH_THRESHOLD = 0.85;

export interface SearchResultItem {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResultItem[];
}

export function isMatchInDb(response: SearchResponse): boolean {
  const top = response.results[0];
  return !!top && top.score >= MATCH_THRESHOLD;
}

interface CheckMuralModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, "View on map" triggers this with the matched mural id and closes modal (no navigation). */
  onViewOnMap?: (muralId: string) => void;
}

const SHEET = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

const CENTER = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

const SIDEBAR_WIDTH = "min(520px, 94vw)";

const TURNSTILE_WIDGET_ID = "check-mural-turnstile";
const TURNSTILE_CALLBACK_NAME = "checkMuralTurnstileCallback";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type Phase = "capture" | "checking" | "result" | "error";

type SelectedResult = SearchResultItem | "none" | null;

export function CheckMuralModal({ isOpen, onClose, onViewOnMap }: CheckMuralModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedBlobRef = useRef<Blob | null>(null);
  const addToDbWithTokenRef = useRef<((token: string) => void) | null>(null);

  const turnstileSiteKey =
    typeof process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === "string" &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim() !== ""
      ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()
      : null;

  const [phase, setPhase] = useState<Phase>("capture");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedResult, setSelectedResult] = useState<SelectedResult>(null);
  const [addToDbPending, setAddToDbPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const variants = isDesktop ? CENTER : SHEET;

  useFocusTrap(dialogRef, isOpen);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(() => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not supported. Use \"Upload photo\" instead.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        setCameraError("Camera access denied. Use \"Upload photo\" instead.");
      });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhase("capture");
      setCameraError(null);
      setSearchError(null);
      setSearchResult(null);
      setSelectedResult(null);
      setAddToDbPending(false);
      lastSubmittedBlobRef.current = null;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
  }, [isOpen, stopCamera, previewUrl]);

  useEffect(() => {
    if (phase === "result" && lastSubmittedBlobRef.current) {
      const url = URL.createObjectURL(lastSubmittedBlobRef.current);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
      };
    }
  }, [phase]);

  useEffect(() => {
    if (isOpen && phase === "capture") {
      startCamera();
    }
    return () => {
      if (phase !== "capture") stopCamera();
    };
  }, [isOpen, phase, startCamera, stopCamera]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }
  }, [isOpen, onClose]);

  const submitImage = useCallback(async (blob: Blob) => {
    lastSubmittedBlobRef.current = blob;
    stopCamera();
    setPhase("checking");
    setSearchError(null);
    setSearchResult(null);
    setSelectedResult(null);
    const formData = new FormData();
    formData.append("image", blob, "capture.jpg");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data?.error ?? "Search failed");
        setPhase("error");
        return;
      }
      const response = data as SearchResponse;
      setSearchResult(response);
      const matches = response.results.filter((r) => r.score >= MATCH_THRESHOLD);
      if (matches.length === 1) {
        setSelectedResult(matches[0]);
      }
      setPhase("result");
    } catch {
      setSearchError("Network error. Try again.");
      setPhase("error");
    }
  }, [stopCamera]);

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState !== 4) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) submitImage(blob);
      },
      "image/jpeg",
      0.9
    );
  }, [submitImage]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      submitImage(file);
      e.target.value = "";
    },
    [submitImage]
  );

  const handleCheckAnother = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPhase("capture");
    setSearchResult(null);
    setSelectedResult(null);
    setSearchError(null);
    lastSubmittedBlobRef.current = null;
    startCamera();
  }, [startCamera, previewUrl]);

  const submitLearningUpsert = useCallback(async (muralId: string) => {
    const blob = lastSubmittedBlobRef.current;
    if (!blob) return;
    const fd = new FormData();
    fd.append("image", blob, "capture.jpg");
    fd.append("muralId", muralId);
    try {
      await fetch("/api/murals", { method: "POST", body: fd });
    } catch {
      // Fire-and-forget; learning best-effort
    }
  }, []);

  const doAddToDbWithToken = useCallback(
    async (token: string) => {
      const blob = lastSubmittedBlobRef.current;
      if (!blob) return;
      setAddToDbPending(true);
      const fd = new FormData();
      fd.append("turnstileToken", token);
      fd.append("image", blob, "capture.jpg");
      try {
        const res = await fetch("/api/murals/submit", { method: "POST", body: fd });
        if (res.ok) {
          setAddToDbPending(false);
          handleCheckAnother();
        } else {
          const data = await res.json().catch(() => ({}));
          setSearchError(data?.error ?? "Submission failed");
          setPhase("error");
          setAddToDbPending(false);
        }
      } catch {
        setSearchError("Network error. Try again.");
        setPhase("error");
        setAddToDbPending(false);
      }
    },
    [handleCheckAnother]
  );

  useEffect(() => {
    (window as unknown as Record<string, (t: string) => void>)[TURNSTILE_CALLBACK_NAME] = (
      token: string
    ) => addToDbWithTokenRef.current?.(token);
    return () => {
      delete (window as unknown as Record<string, unknown>)[TURNSTILE_CALLBACK_NAME];
    };
  }, []);

  useEffect(() => {
    addToDbWithTokenRef.current = doAddToDbWithToken;
  }, [doAddToDbWithToken]);

  useEffect(() => {
    if (!isOpen || !turnstileSiteKey || phase !== "result") return;
    if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)) return;
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    document.head.appendChild(script);
  }, [isOpen, turnstileSiteKey, phase]);

  const handleAddToDb = useCallback(() => {
    if (!lastSubmittedBlobRef.current) return;
    if (!turnstileSiteKey) {
      setSearchError("Captcha not configured. Cannot submit.");
      setPhase("error");
      return;
    }
    const w = (window as unknown as { turnstile?: { execute: (id: string) => void } }).turnstile;
    if (w?.execute) {
      w.execute(TURNSTILE_WIDGET_ID);
    } else {
      setSearchError("Captcha not ready. Try again in a moment.");
      setPhase("error");
    }
  }, [turnstileSiteKey]);

  const match = searchResult && isMatchInDb(searchResult);
  const results = searchResult?.results ?? [];
  const matchResults = results.filter((r) => r.score >= MATCH_THRESHOLD);
  /** When we have a match, show only results at or above threshold (often 1 for exact image). When no match, show no candidates. */
  const displayResults = match ? matchResults : [];
  const thumbSrc = (p: Record<string, unknown> | undefined) =>
    typeof p?.thumbnail === "string"
      ? (p.thumbnail as string)
      : typeof p?.imageUrl === "string"
        ? (p.imageUrl as string)
        : null;

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
          <div
            className="safe-bottom fixed z-50 bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2"
            style={isDesktop ? { width: SIDEBAR_WIDTH } : undefined}
            aria-hidden
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="check-mural-modal-title"
              aria-describedby="check-mural-modal-desc"
              className="flex h-full max-h-[85vh] flex-col overflow-hidden border border-zinc-200 bg-white shadow-xl rounded-t-3xl border-t md:max-h-[90vh] md:rounded-2xl"
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
                <span className="h-1.5 w-12 shrink-0 rounded-full bg-zinc-300" />
              </div>
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
                <h2
                  id="check-mural-modal-title"
                  className="text-lg font-semibold text-zinc-900"
                >
                  Check a mural
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div id="check-mural-modal-desc" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                {phase === "capture" && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-zinc-600">
                      Take a photo of a mural or upload an image to see if it&apos;s in our database.
                    </p>
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                        aria-label="Camera preview"
                      />
                      {cameraError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/95 p-4 text-center text-sm text-zinc-700">
                          {cameraError}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {!cameraError && (
                        <button
                          type="button"
                          onClick={captureFromVideo}
                          className="min-h-[44px] w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                          aria-label="Capture photo"
                        >
                          Capture photo
                        </button>
                      )}
                      <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border-2 border-[var(--color-accent)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)] focus-within:ring-2 focus-within:ring-[var(--color-accent)] focus-within:ring-offset-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileChange}
                          className="sr-only"
                          aria-label="Upload photo from device"
                        />
                        Upload photo
                      </label>
                    </div>
                  </div>
                )}

                {phase === "checking" && (
                  <div className="flex flex-col items-center justify-center gap-4 py-8" role="status" aria-live="polite">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-[var(--color-accent)]" aria-hidden />
                    <p className="text-sm font-medium text-zinc-700">Checking…</p>
                  </div>
                )}

                {phase === "result" && searchResult && (
                  <div className="flex flex-col gap-4" aria-live="polite">
                    {match ? (
                      <p className="text-base text-zinc-600">
                        Looks like we might have this one. Tap the match below, or choose &quot;None of these&quot; if it&apos;s not here.
                      </p>
                    ) : (
                      <p className="text-base text-zinc-600">
                        We don&apos;t have this one in our collection yet. Add it below and we&apos;ll have it for next time.
                      </p>
                    )}
                    {previewUrl && (
                      <div className="flex justify-center">
                        <img
                          src={previewUrl}
                          alt="Photo you are adding to the database"
                          className="max-h-[min(40vh,280px)] w-auto max-w-full rounded-lg border border-zinc-200 object-contain"
                        />
                      </div>
                    )}
                    {previewUrl && displayResults.length > 0 && (
                      <div
                        className="h-px w-full bg-zinc-200"
                        role="presentation"
                        aria-hidden
                      />
                    )}
                    {displayResults.length === 0 && (
                      <div className="flex flex-col gap-3 pt-2">
                        {turnstileSiteKey && (
                          <div
                            id={TURNSTILE_WIDGET_ID}
                            className="cf-turnstile sr-only"
                            data-sitekey={turnstileSiteKey}
                            data-callback={TURNSTILE_CALLBACK_NAME}
                            data-size="invisible"
                            aria-hidden
                          />
                        )}
                        <button
                          type="button"
                          onClick={handleAddToDb}
                          disabled={addToDbPending || !turnstileSiteKey}
                          className="min-h-[44px] w-full rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Add this mural to the database"
                          title={!turnstileSiteKey ? "Captcha not configured" : undefined}
                        >
                          {addToDbPending ? "Submitting…" : "Add to database"}
                        </button>
                      </div>
                    )}
                    {displayResults.length > 0 && (
                      <>
                        <ul
                          role="list"
                          className={`grid max-h-[min(55vh,360px)] gap-3 overflow-y-auto justify-items-center ${displayResults.length === 1
                            ? "grid-cols-1"
                            : displayResults.length === 2
                              ? "grid-cols-2"
                              : "grid-cols-3"
                            }`}
                          aria-label="Search results"
                        >
                          {displayResults.map((r) => {
                            const src = thumbSrc(r.payload);
                            const title =
                              typeof r.payload?.title === "string"
                                ? (r.payload.title as string)
                                : r.id;
                            const isSelected = selectedResult === r;
                            return (
                              <li key={r.id} className="w-full min-w-0 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedResult(r)}
                                  className={`flex w-full max-w-[10rem] rounded-lg border-2 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ${isSelected
                                    ? "border-green-600 bg-green-600"
                                    : "border-zinc-200 bg-white hover:border-zinc-300"
                                    }`}
                                  aria-pressed={isSelected}
                                  aria-label={`Select: ${title}`}
                                >
                                  <span className="relative block w-full aspect-square overflow-hidden rounded-md">
                                    {src ? (
                                      <img
                                        src={src}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        width={112}
                                        height={112}
                                      />
                                    ) : (
                                      <span className="block h-full w-full bg-zinc-100" />
                                    )}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="flex min-h-[44px] w-full flex-row items-stretch gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedResult("none")}
                            className={`flex flex-1 items-center justify-center rounded-xl border-2 p-2 text-center text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${selectedResult === "none"
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-red-500 bg-white text-red-600 hover:bg-red-50"
                              }`}
                            aria-pressed={selectedResult === "none"}
                            aria-label="None of these"
                          >
                            None of these
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedResult === "none") {
                                handleAddToDb();
                              } else if (selectedResult) {
                                submitLearningUpsert(selectedResult.id);
                                onViewOnMap?.(selectedResult.id);
                                onClose();
                              }
                            }}
                            disabled={selectedResult === null || (selectedResult === "none" && addToDbPending)}
                            className="flex flex-1 items-center justify-center rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {selectedResult === "none"
                              ? addToDbPending
                                ? "Submitting…"
                                : "Confirm selection"
                              : "Confirm selection"}
                          </button>
                        </div>
                      </>
                    )}
                    <div className="-mt-2 -mb-1 flex justify-center">
                      <button
                        type="button"
                        onClick={handleCheckAnother}
                        className="rounded px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                        aria-label="Check another mural"
                      >
                        Check another
                      </button>
                    </div>
                  </div>
                )}

                {phase === "error" && (
                  <div className="flex flex-col gap-4" aria-live="polite">
                    <p className="text-sm font-medium text-red-700">
                      {searchError}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCheckAnother}
                        className="min-h-[44px] flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                      >
                        Try again
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[44px] flex-1 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
