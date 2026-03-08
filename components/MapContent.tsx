"use client";

import { useMemo, useState } from "react";
import { MapHeader } from "@/components/MapHeader";
import { MuralList } from "@/components/MuralList";
import { MuralMap } from "@/components/MuralMap";
import { MuralModal } from "@/components/MuralModal";
import { ProximityBanner } from "@/components/ProximityBanner";
import { TourList } from "@/components/TourList";
import { useMuralStore } from "@/store/muralStore";
import { useTourStore } from "@/store/tourStore";
import { getOrderedMuralsForCollection } from "@/lib/collections";
import { useGeofence } from "@/hooks/useGeofence";
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

  const { nearbyMural, clearNearby } = useGeofence(displayMurals);

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
      />
      <MuralModal />
      {nearbyMural && (
        <ProximityBanner
          mural={nearbyMural}
          onView={requestFlyTo}
          onDismiss={clearNearby}
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
