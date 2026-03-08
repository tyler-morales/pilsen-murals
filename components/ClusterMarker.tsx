"use client";

interface ClusterMarkerProps {
  count: number;
  onClick: () => void;
}

/**
 * Numbered cluster marker for zoomed-out map view. Replaces many overlapping
 * mural thumbnails with a single count; click zooms in to expand the cluster.
 */
export function ClusterMarker({ count, onClick }: ClusterMarkerProps) {
  const label =
    count >= 1000 ? `${Math.floor(count / 1000)}k` : count.toString();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-full border-2 border-white bg-amber-500 text-sm font-bold text-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-dynamic-surface"
      aria-label={`${count} murals in this area — zoom in to view`}
    >
      {label}
    </button>
  );
}
