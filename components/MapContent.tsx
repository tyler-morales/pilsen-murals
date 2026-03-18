"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CaptureRevealAnimation } from "@/components/CaptureRevealAnimation";
import { CheckMuralModal } from "@/components/CheckMuralModal";
import { LocationPrompt } from "@/components/LocationPrompt";
import { MapHeader } from "@/components/MapHeader";
import { MuralMap } from "@/components/MuralMap";
import { MuralModal } from "@/components/MuralModal";
import { MuraldexView } from "@/components/MuraldexView";
import { NearbyMuralCard } from "@/components/NearbyMuralCard";
import { TourList } from "@/components/TourList";
import { useCaptureStore } from "@/store/captureStore";
import { useMuralStore } from "@/store/muralStore";
import { useProximityStore } from "@/store/proximityStore";
import { useTourStore } from "@/store/tourStore";
import { getOrderedMuralsForCollection } from "@/lib/collections";
import { useProximity } from "@/hooks/useProximity";
import type { Mural } from "@/types/mural";
import type { Collection } from "@/types/collection";

interface MapContentProps {
  murals: Mural[];
  collections: Collection[];
}

const enableCheckMural =
  process.env.NEXT_PUBLIC_ENABLE_CHECK_MURAL === "true";

export function MapContent({ murals, collections }: MapContentProps) {
  const [tourListOpen, setTourListOpen] = useState(false);
  const [checkMuralOpen, setCheckMuralOpen] = useState(false);
  const [muraldexOpen, setMuraldexOpen] = useState(false);
  const [muralNotFoundNotice, setMuralNotFoundNotice] = useState(false);
  const [captureRevealMuralId, setCaptureRevealMuralId] = useState<string | null>(null);
  const requestFlyTo = useMuralStore((s) => s.requestFlyTo);
  const getCaptureFor = useCaptureStore((s) => s.getCaptureFor);
  const activeTour = useTourStore((s) => s.activeTour);
  const setActiveTour = useTourStore((s) => s.setActiveTour);

  const displayMurals = useMemo(() => {
    if (!activeTour) return murals;
    return getOrderedMuralsForCollection(activeTour, murals);
  }, [activeTour, murals]);

  useProximity(displayMurals);
  const currentNearby = useProximityStore((s) => s.currentNearby);
  const isModalOpen = useMuralStore((s) => s.isModalOpen);
  const activeMural = useMuralStore((s) => s.activeMural);
  // Don't highlight the nearby marker when that mural is already open in the modal (avoids duplicate thumbnail + "You're near" on screen).
  const nearbyMuralIdForMap =
    currentNearby?.id != null && (!isModalOpen || activeMural?.id !== currentNearby.id)
      ? currentNearby.id
      : null;

  const routeCoordinates = useMemo(
    () =>
      activeTour && displayMurals.length >= 2
        ? displayMurals.map((m) => m.coordinates)
        : null,
    [activeTour, displayMurals]
  );

  const handleCheckMuralViewOnMap = (muralId: string) => {
    const mural = murals.find((m) => m.id === muralId);
    if (mural) {
      requestFlyTo(mural, { openModalAfterFly: false });
    }
    setCheckMuralOpen(false);
  };

  const handleCaptureConfirmed = (muralId: string) => {
    setCaptureRevealMuralId(muralId);
    setCheckMuralOpen(false);
  };

  const handleCaptureRevealDismiss = () => {
    const muralId = captureRevealMuralId;
    setCaptureRevealMuralId(null);
    if (muralId) {
      const mural = murals.find((m) => m.id === muralId);
      if (mural) requestFlyTo(mural, { openModalAfterFly: false });
    }
  };

  const appliedDeepLinkRef = useRef(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (appliedDeepLinkRef.current) return;
    const muralId = searchParams.get("mural");
    if (!muralId) return;
    const mural = murals.find((m) => m.id === muralId);
    appliedDeepLinkRef.current = true;
    if (!mural) {
      setMuralNotFoundNotice(true);
      return;
    }
    requestFlyTo(mural);
  }, [searchParams, murals, requestFlyTo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (isModalOpen && activeMural) {
      params.set("mural", activeMural.id);
    } else {
      params.delete("mural");
    }
    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [isModalOpen, activeMural?.id]);

  return (
    <>
      <LocationPrompt />
      {muralNotFoundNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-20 z-[45] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg"
        >
          <p className="text-center text-sm text-amber-900">
            We couldn&apos;t find that mural. It may have been removed or the link might be outdated.
          </p>
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setMuralNotFoundNotice(false)}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <MapHeader
        murals={displayMurals}
        onMapClick={() => { setMuraldexOpen(false); setTourListOpen(false); }}
        onMuraldexClick={murals.length > 0 ? () => setMuraldexOpen((o) => !o) : undefined}
        isMuraldexOpen={muraldexOpen}
        activeTour={activeTour}
        onToursClick={() => setTourListOpen(true)}
        onLeaveTour={() => setActiveTour(null)}
        isTourListOpen={tourListOpen}
        onCheckMuralClick={enableCheckMural ? () => setCheckMuralOpen(true) : undefined}
      />
      <MuralMap
        murals={displayMurals}
        showTourNumbers={!!activeTour}
        routeCoordinates={routeCoordinates}
        nearbyMuralId={nearbyMuralIdForMap}
      />
      <MuralModal />
      {!isModalOpen && (
        <NearbyMuralCard
          activeTour={activeTour}
          orderedMurals={displayMurals}
        />
      )}
      <TourList
        collections={collections}
        isOpen={tourListOpen}
        onClose={() => setTourListOpen(false)}
      />
      <MuraldexView
        murals={murals}
        isOpen={muraldexOpen}
        onClose={() => setMuraldexOpen(false)}
        onSelectMural={(mural) => {
          requestFlyTo(mural);
          setMuraldexOpen(false);
        }}
      />
      {captureRevealMuralId && (() => {
        const mural = murals.find((m) => m.id === captureRevealMuralId);
        const capture = getCaptureFor(captureRevealMuralId);
        if (!mural || !capture) return null;
        return (
          <CaptureRevealAnimation
            mural={mural}
            capture={capture}
            onDismiss={handleCaptureRevealDismiss}
          />
        );
      })()}
      {enableCheckMural && (
        <CheckMuralModal
          isOpen={checkMuralOpen}
          onClose={() => setCheckMuralOpen(false)}
          onViewOnMap={handleCheckMuralViewOnMap}
          onCaptureConfirmed={handleCaptureConfirmed}
          murals={murals}
        />
      )}
    </>
  );
}
