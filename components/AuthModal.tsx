"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuthStore } from "@/store/authStore";
import { useCaptureStore } from "@/store/captureStore";
import { createClient } from "@/lib/supabase/browser";
import { Loader2, Mail, X } from "lucide-react";

const CENTER_ANIM = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

const SHEET_ANIM = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

const DEFAULT_TITLE = "Sign in";
const DEFAULT_MESSAGE = "Sign in to sync your captured murals across devices.";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export function AuthModal({ isOpen, onClose, title, message }: AuthModalProps) {
  const dialogTitle = title ?? DEFAULT_TITLE;
  const dialogMessage = message ?? DEFAULT_MESSAGE;
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const haptics = useHaptics();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const user = useAuthStore((s) => s.user);
  const captures = useCaptureStore((s) => s.captures);
  const dragControls = useDragControls();

  useFocusTrap(dialogRef, isOpen);

  const handleDrawerDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const threshold = 80;
      const velocityThreshold = 300;
      if (info.offset.y > threshold || info.velocity.y > velocityThreshold) {
        haptics.nudge();
        onClose();
      }
    },
    [haptics, onClose]
  );

  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "";

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
    haptics.success();
  };

  const handleSignOut = async () => {
    haptics.tap();
    await createClient().auth.signOut();
    onClose();
  };

  const displayTitle = user ? "Account" : dialogTitle;
  const panelVariants = isDesktop ? CENTER_ANIM : SHEET_ANIM;
  const transition = { type: "spring" as const, damping: 28, stiffness: 300 };

  const accountContent = user && (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <p className="mb-4 text-sm text-zinc-600">
        {captures.length} capture{captures.length !== 1 ? "s" : ""} synced
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 font-medium text-zinc-700 transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      >
        Sign out
      </button>
    </div>
  );

  const signInContent = !user && (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 overscroll-contain">
      {sent ? (
        <p className="text-center text-zinc-600">
          Check your email for a sign-in link. You can close this and return
          after clicking the link.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-zinc-600">{dialogMessage}</p>
          <form onSubmit={handleMagicLink} className="mb-4 space-y-3">
            <label htmlFor="auth-email" className="sr-only">
              Email address
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                autoComplete="email"
                className="w-full rounded-xl border border-zinc-300 py-2.5 pl-10 pr-3 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50"
                aria-invalid={!!error}
                aria-describedby={error ? "auth-error" : undefined}
              />
            </div>
            {error && (
              <p id="auth-error" className="text-sm text-red-600">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 font-medium text-white transition hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                "Send magic link"
              )}
            </button>
          </form>
        </>
      )}
    </div>
  );

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
          {isDesktop ? (
            <div
              className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
              aria-hidden
            >
              <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={displayTitle}
                className="pointer-events-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl md:max-h-[90vh]"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={transition}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 p-4">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {displayTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.tap();
                      onClose();
                    }}
                    className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                {accountContent}
                {signInContent}
              </motion.div>
            </div>
          ) : (
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={displayTitle}
              className="safe-bottom fixed bottom-0 left-0 right-0 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl border-t border-zinc-200 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={transition}
              onClick={(e) => e.stopPropagation()}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.4 }}
              dragControls={dragControls}
              dragListener={false}
              onDragEnd={handleDrawerDragEnd}
              dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
            >
              <div
                className="flex min-h-[44px] cursor-grab active:cursor-grabbing flex-col items-center justify-center pt-3 pb-1 touch-none"
                aria-hidden
                onPointerDown={(e) => dragControls.start(e)}
              >
                <span
                  className="h-[5px] w-10 shrink-0 rounded-full bg-zinc-300"
                  aria-hidden
                />
              </div>
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 p-4">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {displayTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    haptics.tap();
                    onClose();
                  }}
                  className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              {accountContent}
              {signInContent}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
