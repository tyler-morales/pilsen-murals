export default function Loading() {
  return (
    <div
      className="fixed inset-0 flex flex-col bg-[var(--color-night-bg)]"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Skeleton: header bar */}
      <div className="safe-top flex shrink-0 gap-2 px-4 pt-2 pb-3">
        <div className="h-5 w-32 rounded-lg loading-skeleton-soft bg-white/10" />
        <div className="h-5 w-16 rounded-lg loading-skeleton-soft bg-white/10" />
        <div className="ml-auto h-8 w-8 rounded-full loading-skeleton-soft bg-white/10" />
      </div>
      {/* Skeleton: map area — fills remaining space with gentle pulse */}
      <div className="loading-skeleton-soft min-h-0 flex-1 bg-white/5" />
    </div>
  );
}
