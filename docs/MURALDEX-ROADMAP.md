# Muraldex / Pokedex-for-Murals — Roadmap (Tiers 2–4)

Brainstorm doc for the "capture them all" / Pokedex-style experience. **Tier 1 is done** (Muraldex grid, capture store, rarity, capture-reveal animation). Below are tiers to revisit later.

---

## What’s Already in Place (Tier 1 — Done)

- **Capture mechanic**: Camera-based CLIP matching (`CheckMuralModal`) — snap a photo, identify mural.
- **Proximity**: 100 m geofence, nearby card with haptic pulse on approach.
- **Seen tracking**: `pilsen-murals-seen-murals` in localStorage; capture store for “captured” murals.
- **Tours/collections**: Ordered walking tours with stop numbering.
- **Rarity**: `lib/rarity.ts` — common/uncommon/rare/legendary from distance to 18th & Ashland (and optional `LEGENDARY_IDS`).
- **Capture reveal**: Full-screen card-reveal + confetti + haptics on confirmed match.
- **Muraldex view**: Progress (X/Y discovered), filters (All, Captured, Nearby, Undiscovered), grid with rarity borders.

---

## Tier 2: Walk & Discover (medium effort)

### Passive proximity notifications

- **Foreground**: Already works via `NearbyMuralCard`.
- **Background**: Service Worker + Push API or Geolocation `watchPosition` in background.
  - Options: Background Geolocation API, Geofencing API (when available), or `watchPosition` + periodic wake.
  - When app is open: cache mural coords as geofence zones; use Notification API — “You’re near [Mural Name]! Open to capture it.”
  - Android PWA: `beforeinstallprompt` + push works well; iOS is more limited; foreground flow already works.

### “Mural Radar”

- Sonar-style overlay on the map: concentric rings from user position.
- Uncaptured murals within ~500 m glow/ping on the radar; captured = solid dots.
- Use existing `haversineDistanceMeters` + Mapbox circle layers.
- Direction line: “2 undiscovered murals to the east” (reuse `bearingToDirectionText`).

### Streak system

- “3-day streak: You’ve captured a mural 3 days in a row.”
- “Weekend warrior: 5 murals in one session.”
- “Night owl: Captured after sunset” (use existing `suncalc`).
- “Full tour: Completed all stops on [Tour Name].”

---

## Tier 3: Social & Competitive (higher effort)

### Trainer card / profile

- Avatar (or generated from murals captured).
- Stats: total captured, rarity breakdown, longest streak, total distance walked.
- Shareable as image (canvas-to-PNG + Web Share API).
- Optional QR code linking to public profile or a specific mural.

### Leaderboard (anonymous or opt-in)

- “Most murals captured this week.”
- “Fastest to complete the 18th Street tour.”
- Backend: lightweight table (e.g. Supabase `user_stats` with anonymous IDs).

### Trading card mechanic

- Each capture = unique “card”: user photo, time of day, optional weather (free API), procedural border from mural `dominantColor`.
- “Golden frame” for captures during golden hour (`suncalc`).
- Share individual cards as images.

---

## Tier 4: Wild Ideas (novel / differentiating)

### AR “mural ghost” mode

- For murals that have been **painted over** (legendary): camera + AR overlay shows what the mural used to look like on the current wall.
- WebXR or simpler “hold up phone to see the ghost” with semi-transparent overlay.

### Seasonal / time-based variants

- Same mural at sunrise vs sunset vs rain vs snow = different “variants” of the same card.
- Use existing `imageMetadata["Date taken"]` and optional weather API at capture time.
- Variant ideas: Dawn (5–7 am) “Aurora,” golden hour “Golden,” night “Nocturn,” rain/snow “Storm.”

### “Evolution” mechanic

- Mural “evolves” with engagement:
  1. **Spotted**: Proximity triggered.
  2. **Captured**: Photo matched.
  3. **Studied**: Read artist bio, got directions, learned history.
  4. **Mastered**: 3+ lighting conditions, shared, 3+ visits.
- Each stage unlocks more in the Muraldex (e.g. artist quotes, historical photos).

### Community “gym” mechanic

- Certain murals = “gyms” (large, iconic). To “claim” a gym: capture all murals within a 2-block radius.
- Claiming = badge + optional username on that mural’s entry; drives foot traffic to undervisited areas.

### Sound design

- Short audio on capture (mariachi, ambient city, birdsong) by mural theme; a few `<audio>` elements.

---

## Suggested Build Order (when revisiting)

1. **Muraldex grid** — Done in Tier 1.
2. **Capture celebration** — Done in Tier 1.
3. **Rarity badges** — Done in Tier 1 (`lib/rarity.ts`).
4. **Streak tracking** — localStorage; small addition to capture/proximity flow.
5. **Shareable trainer card** — Canvas-to-image + Web Share.
6. **Mural Radar** — Reuses geo + map layers.
7. **Proximity notifications (background)** — Phase 2 after collection loop feels solid.
8. **AR / variants / evolution / gyms** — Later, as differentiators.

---

## References in Codebase

- Proximity: `store/proximityStore.ts`, `hooks/useProximity.ts`, `lib/geo.ts` (`GEOFENCE_RADIUS_M`, `getMuralsWithinRadiusWithDistance`).
- Capture: `store/captureStore.ts`, `components/CaptureRevealAnimation.tsx`, `components/MuraldexView.tsx`.
- Rarity: `lib/rarity.ts`.
- Tours: `store/tourStore.ts`, `lib/collections.ts`, `types/collection.ts`.
- Sun/time: `lib/sunPilsen.ts`, `suncalc` in package.json.
