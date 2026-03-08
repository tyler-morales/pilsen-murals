export default function Loading() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-zinc-950"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
    </div>
  );
}
