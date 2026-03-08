"use client";

import { useMemo, useState } from "react";
import { LocationPrompt } from "@/components/LocationPrompt";
import { MapHeader } from "@/components/MapHeader";
import { MuralList } from "@/components/MuralList";
import { MuralMap } from "@/components/MuralMap";
import { MuralModal } from "@/components/MuralModal";
import { NearbyMuralCard } from "@/components/NearbyMuralCard";
import { TourList } from "@/components/TourList";
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

export function MapContent({ murals, collections }: MapContentProps) {
  const [listOpen, setListOpen] = useState(false);
  const [tourListOpen, setTourListOpen] = useState(false);
  const requestFlyTo = useMuralStore((s) => s.requestFlyTo);
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

  const handleSelectMural = (mural: Mural) => {
    requestFlyTo(mural);
    setListOpen(false);
  };

  return (
    <>
      <LocationPrompt />
      <MapHeader
        murals={displayMurals}
        onBrowseClick={() => setListOpen((o) => !o)}
        isListOpen={listOpen}
        activeTour={activeTour}
        onToursClick={() => setTourListOpen(true)}
        onLeaveTour={() => setActiveTour(null)}
        isTourListOpen={tourListOpen}
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
      <MuralList
        murals={displayMurals}
        isOpen={listOpen}
        onClose={() => setListOpen(false)}
        onSelectMural={handleSelectMural}
        listTitle={
          activeTour
            ? `Tour: ${activeTour.name} — ${displayMurals.length} stops`
            : undefined
        }
      />
      <TourList
        collections={collections}
        isOpen={tourListOpen}
        onClose={() => setTourListOpen(false)}
      />
    </>
  );
}
