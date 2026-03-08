# TODOS

## Done (PoC)

- Next.js 15 App Router + Tailwind, Mapbox GL v3, Framer Motion, Zustand
- **Mural indicators**: Thumbnail image per mural (100–200px height, aspect ratio from image metadata); per-mural dominant color glow; no spinning shape.
- **Dynamic lighting by sun position (Pilsen, Chicago)**: SunCalc for altitude; `lib/sunPilsen.ts`, `store/themeStore.ts`, `ThemeByPilsenTime` (60s interval); CSS variables `--sun-brightness`/`--sun-altitude-deg` and `color-mix()` for UI; modal/marker use dynamic classes.
- `data/murals.json` — placeholder murals (Pilsen-area coordinates)
- Zustand store: `activeMural`, `isModalOpen`, `openModal`, `closeModal`; theme store has `mapLightPreset` (day/night/dawn/dusk) from sun altitude/azimuth.
- `MuralMap`: Mapbox **Standard** style (sky + sun-based lighting); `lightPreset` synced to Pilsen time via `setConfigProperty('basemap', 'lightPreset', …)`; 3D buildings from style; custom glowing HTML markers, flyTo on marker click (includes mural `bearing` so map orients to image direction), modal opens on moveend.
- `MuralModal`: Framer Motion slide-in, editorial layout (image, title, artist, color swatch, address)
- README + `.env.local.example` for Mapbox token

## Refactor / Cleanup (done)

- **Map**: Switched from `dark-v11` to Mapbox Standard style so light/dark and sun-based lighting (sky, shadows) are visible; removed custom 3D building layer and brightness overlay; theme store exposes `mapLightPreset` and `sunAzimuthDeg` for dawn vs dusk.
- Removed unused `setActiveMural` from mural store (only `openModal`/`closeModal` used).
- Removed dead CSS: `--map-bg`, `.mapboxgl-popup-close-button` (no popups used).
- Removed unused Tailwind `mural.glow` (glow uses `:root` `--glow` in keyframes).
- Modal image: added descriptive `alt` for a11y.
- **Mural slideout readability**: Modal panel uses fixed light theme (white/zinc) so text is always high-contrast; dominant color kept as accent bar and swatch only.
- **Mural slide-out image metadata**: `generate-map-data.js` extracts full EXIF (date, camera, exposure, etc.) into `imageMetadata`; `MuralModal` shows an "Image metadata" section when present.
- **Map markers**: Replaced 3D diamond with mural thumbnail; removed `mural-diamond-spin` / `mural-diamond-float` from Tailwind (dead code).
- **Map marker styling**: Minimal white outline (1px border white/70, shadow-md); focus ring white/80 for a11y.
- **Mural thumbnails zoom-aware**: Thumbnail size scales with map zoom (28px height at zoom 11, 88px at zoom 18) so they stay small when zoomed out (less overlap, don’t obscure 3D buildings) and grow when zoomed in; map listens to `zoom`/`zoomend` and re-renders markers.
- **Mural modal full image**: Modal image uses dynamic aspect ratio from `imageMetadata` (Width/Height) so horizontal murals are no longer cropped; `object-contain` ensures full image is always visible; ratio clamped 9/16–2, default 4/5 when metadata missing.
- **Performance**: Marker size updates only on `zoomend` (removed `zoom` listener) to avoid hundreds of React re-renders during zoom. Three.js mural building layer disabled in default flow (HTML markers only). Glow animation on markers is hover/focus-only. Modal overlay uses `bg-black/60` without backdrop blur. Theme store subscription moved into map load callback so `MuralMap` does not re-render every 60s.

## Scripts

- `scripts/generate-map-data.js`: EXIF GPS + full image metadata + **per-image dominant color** (sharp resize + quantize) → murals.json; outputs **.webp** paths for high-res and thumbnails. Run with photos in `raw-photos`, output to `public/data/murals.json`. Fallback `#333333` if extraction fails. Copy to `data/murals.json` for app import. Image metadata appears in the mural slide-out.
- `scripts/sync-murals.js`: Full pipeline — run **whenever you add new photos** to `raw-photos`. Runs generate-map-data, copies murals.json to `data/`, converts only **new or changed** images to WebP (skips when high-res + thumb WebP exist and are newer than source). Progress bar during conversion. **Empties raw-photos** after a successful sync. Use: `npm run sync-murals`.

## Refactor / Cleanup (done, continued)

- **app/page.tsx**: Cast murals JSON via `as unknown as Mural[]` to satisfy `coordinates: [number, number]` from JSON `number[]`.
- **Mural images on buildings**: Custom layer `lib/muralBuildingLayer.ts` draws each mural as a textured Three.js quad in 3D at the mural's coordinates (3 m altitude), rotated by `bearing` so the image sits on the correct building face; HTML markers remain for click.
- **Mural modal image enlarge**: Modal image is clickable; opens an almost-fullscreen lightbox (90vh/95vw max, dark backdrop). Close via Escape, backdrop click, or close button; keyboard and focus states for a11y.

## UI improvements (done)

- **Phase 1**: `MapHeader` — floating header with app title, mural count, Pilsen time (America/Chicago), and lighting preset (Dawn/Day/Dusk/Night). Rendered in `MapContent`; page uses `MapContent` wrapper.
- **Phase 2**: "Surprise me" button in header; `muralStore` extended with `pendingFlyTo`, `requestFlyTo`, `clearPendingFlyTo`. `MuralMap` reacts to `pendingFlyTo` (fly then open modal on moveend). List and Surprise me use same path.
- **Phase 3**: Modal — "Get directions" link (address or coordinates → Google Maps), photo date from `imageMetadata["Date taken"]`, full-width dominant-color accent bar, "Image metadata" in `<details>` (collapsed by default).
- **Phase 4**: Prev/Next in modal; store has `muralsOrder`, `activeIndex`, `goPrev`, `goNext`. `openModal(mural, allMurals)` sets order and index; modal footer has Previous / Next / Close.
- **Phase 5**: `MuralList` — bottom sheet (Framer Motion) with scrollable thumbnails; "Browse" in header toggles list. `MapContent` holds list open state; list item click calls `requestFlyTo(mural)` and closes list.
- **Phase 6**: ~~OnboardingBanner~~ Removed; hint bar no longer shown. `usePrefersReducedMotion` hook; map fly uses duration 0 when reduced motion; modal panel/backdrop use instant transition when reduced motion.
- **Phase 7**: Modal image loading — skeleton placeholder (pulse) and opacity transition until image `onLoad`; reset when modal or `activeMural` changes.
- **MapHeader background**: Header uses solid white (`bg-white`) and dark text so it stays white regardless of `--sun-brightness`; previously `bg-dynamic-surface` made it gray (default 0.5 mix or day surface #f4f4f5).
- **Marker load performance**: Markers created in chunks (8 per chunk) after `map.on("load")` with `requestAnimationFrame` between chunks so the main thread stays responsive. Each marker has a short staggered reveal (opacity + scale) within its chunk; `prefersReducedMotion` skips the animation. Removes initial-load bottleneck and gives a natural “pop in” feel.

## Refactor / Cleanup (done, continued)

- **Header UI**: Removed onboarding hint ("Tap a mural…"). MapHeader buttons restyled: primary accent (amber) for "Surprise me", secondary outline for "Browse"; added `--color-accent` / `--color-accent-hover` / `--color-accent-foreground` in globals.css. Deleted `OnboardingBanner.tsx`.
- **Header readability**: MapHeader uses solid white background and explicit zinc text (zinc-900 title, zinc-600 muted) so title and meta stay readable over any map; Browse button uses accent outline (border + text) and fill on hover for clear contrast.
- **Map markers (single React root)**: Replaced 37 per-marker React roots with one shared root and `createPortal`; `zoomend` triggers a single reconciliation instead of 37 full re-renders. `AllMarkers` in `MuralMap.tsx` portals each `<MuralMarker>` into the existing Mapbox marker wrapper divs.
- **Thumbnail re-fade on map move**: On pan/zoom, `updateMarkers()` creates new wrapper DOM and remounts markers, so each `MuralMarker` re-ran its entrance animation. `MuralMarker` now tracks revealed mural IDs in a module-level `Set`; remounted markers for already-shown murals render visible immediately with no fade.
- **Number clusters when zoomed out**: Supercluster clusters mural points by zoom/viewport; when zoomed out, numbered cluster markers (e.g. "5") replace overlapping thumbnails. Clicking a cluster zooms in to expand it. Individual mural thumbnails show when zoomed in. `ClusterMarker` component; `MuralMap` builds index from murals, runs `getClusters` on zoom/move and swaps cluster vs mural markers accordingly.
- **Mural cards: human tilt + fanned deck**: Every mural card has a deterministic slight rotation and x/y offset from `mural.id` (`getStableCardOffset` in `MuralMarker.tsx`) so cards feel less rigid. Where leaf markers overlap on screen (within 50px), they are grouped into a single placement and rendered as a fanned deck via `FannedMuralCards.tsx`; `MuralMap` uses `groupLeavesIntoPlacements` (union-find by screen distance) and `PlacementMarkers` to render either one `MuralMarker` or one `FannedMuralCards` per placement. Tour mode unchanged (one marker per mural, tilt still applied).
- **Responsiveness/speed (Mar 2025)**: MapHeader reads `pilsenTimeString` from theme store (one 60s tick for time + preset). Theme store and ThemeByPilsenTime document that subscribers must stay minimal. MuralModal uses blurred thumbnail (or imageUrl) as placeholder while full-size image loads (panel + enlarged view). `lib/muralBuildingLayer.ts` has top-of-file notes for future use: viewport culling, texture reuse/thumbnails, minimize triggerRepaint. MuralList virtualized with `@tanstack/react-virtual` (fixed row height, ul/li, a11y). Murals data: client fetch deferred; current server pass kept; for many murals or lighter shell, fetch `/data/murals.json` (or API) from client after hydration and show loading state.

## Refactor / Cleanup (done, continued)

- **Mural images → WebP**: Pipeline now outputs WebP for smaller size and faster loading. `generate-map-data.js` writes `.webp` paths; `sync-murals.js` converts source images to WebP (high-res at quality 88, thumbnails at 400px max width and quality 82), removes orphaned files by expected .webp names. Cache version bumped so next sync regenerates murals.json with .webp paths.
- **Mobile-first**: Viewport export in `app/layout.tsx` (`viewportFit: "cover"`, `themeColor`). Safe-area utilities in `app/globals.css` (`.safe-top`, `.safe-bottom`, `.safe-left`, `.safe-right`, `.safe-bottom-footer`). MapHeader: mobile-default compact layout (`left-2 right-14`, `max-w-[calc(100%-3.5rem)]`), `sm:` for larger spacing; dynamic theme (`bg-dynamic-surface`, `text-dynamic`, `text-dynamic-muted`, `border-dynamic`); 44px min touch targets. MuralList: safe-bottom on sheet; drag handle at top. MuralModal: safe-area on footer (`.safe-bottom-footer`) and enlarged overlay (safe-top/right/bottom/left); 44px min height on footer and close buttons. MuralMarker: 44px minimum touch target (button grows, thumbnail visual unchanged).

## Proximity alerts and location enablement (done)

- **Enable location prompt**: On first load, a small CTA asks to enable location for proximity alerts; `getCurrentPosition` / `watchPosition` are called only after the user taps "Enable". "Not now" dismisses and is persisted in localStorage so the prompt is not shown again until the user clears storage.
- **Implementation**: `store/locationStore.ts` (permission, userCoords, promptDismissed, requestLocation, dismissPrompt); `components/LocationPrompt.tsx` (compact bar with Enable / Not now). No geolocation calls on load.
- **Multiple nearby (queue)**: When two or more murals are within radius (80 m), the closest is shown first in a bottom card; on "View" or "Dismiss", the next in queue is shown. `store/proximityStore.ts` (nearbyQueue, currentNearby, setNearbyFromCoords, showNext); `hooks/useProximity.ts` syncs location coords to proximity store; `components/NearbyMuralCard.tsx` shows one mural with View / Dismiss and optional "N more nearby".
- **MapContent**: Renders LocationPrompt, NearbyMuralCard; runs useProximity(displayMurals); passes currentNearby?.id to MuralMap as nearbyMuralId so the active nearby marker is highlighted (amber border, "You're near" on marker). NearbyMuralCard is hidden when modal is open; when the modal is open for the current nearby mural, nearbyMuralId is passed as null so the map marker does not show the "You're near" thumbnail/label (avoids duplicate on screen).
- **Nearby marker stacking**: When a mural is the "near you" one, its map marker wrapper gets `z-index: 1000` so its card always renders on top of other mural cards (tour and cluster code paths in MuralMap).
- **LocationPrompt layout**: Centered card below header (not under it): `left-1/2 -translate-x-1/2`, `top-[5.5rem]` / `sm:top-24`, `max-w-md`; responsive stack on mobile (flex-col, centered text/buttons), row on sm+; works on mobile and desktop.
- **PWA / background**: Proximity alerts work only while the app is open (watchPosition + in-app card). True "notify when nearby with app closed" would require a native wrapper (e.g. Capacitor with background geolocation) or server-side geofencing + Web Push; see "Later" below.
- **Refactor**: Replaced `useGeofence` (which called watchPosition on load) with opt-in `locationStore` + `useProximity` + `proximityStore`. Removed unused `hooks/useGeofence.ts`. MuralMap no longer triggers GeolocateControl on load; user dot is driven by `locationStore.userCoords`. Removed unused `mapBearing` from MuralMap/AllMarkers (MuralMarker never used it).

## User location on map (done)

- **Feature**: When the user allows location access, their position is shown on the map (blue dot) and can be tracked. A locate-me control appears in the bottom-right with the zoom controls; clicking it prompts for permission (if not yet granted), then shows the user's location and can track movement.
- **Header + map controls (mobile)**: Full app title on mobile (no ellipsis): MapHeader h1 uses `break-words` instead of `truncate`. Fit map moved from header to map: round button next to Geolocate in bottom-right, same shape/size (29px) and similar style; `createFitMapControl` in MuralMap, CSS in globals for `.mapboxgl-ctrl-bottom-right` row layout and `.mapboxgl-ctrl-fit-map`.
- **Refactor**: Map controls (NavigationControl, GeolocateControl, and custom style/compass buttons) moved from top-right to bottom-right so the header can use full available width.
- **Implementation**: `MuralMap.tsx` — Mapbox GL `GeolocateControl` with `trackUserLocation: true`, `showUserHeading: true`, `showUserLocation: true`, high-accuracy position options, and `fitBoundsOptions.maxZoom: 16`.
- **Zoom to user (3D preserved)**: On first `geolocate` (when user grants location), map flies to user with `pitch: 50`, `zoom: 16`, and current bearing so the view keeps the 3D scale effect instead of a flat birds-eye; runs once per session so we don’t re-fly on every position update.
- **User dot fixed to map**: Custom user location dot via GeoJSON source + circle layer (`USER_LOCATION_SOURCE_ID` / `USER_LOCATION_LAYER_ID`); `GeolocateControl` has `showUserLocation: false`. Dot stays at user’s coordinates when panning/zooming and updates on every `geolocate` so it follows the user.
- **Zoom to user when location enabled**: When user enables location via LocationPrompt (or store gets `userCoords`), map flies to user once (zoom 16, pitch 50); `hasFlownToUserFromStoreRef` prevents re-flying on watchPosition updates. NearbyMuralCard (thumbnail) already shows when in range via `useProximity` + `currentNearby`.
- **Geofence radius on map**: 120 m geofence circle drawn around user location (green fill + stroke) via `circlePolygon` in `lib/geo.ts` and GeoJSON fill/line layers in MuralMap; circle appears when location is enabled and clears when coords are null.
- **Pilsen neighborhood border**: Neighborhood outline (Lower West Side / Chicago community area 31) drawn on the map via static GeoJSON in `data/pilsen-boundary.json`; source `pilsen-boundary`, fill (indigo 8% opacity) + line (indigo 70% opacity). Boundary from City of Chicago Data Portal (Boundaries - Community Areas). Re-applied with other custom layers on style change (Standard ↔ Satellite).

## Collections / Walking tours (done)

- **Data**: `types/collection.ts` (Collection: id, name, description?, muralIds, estimatedMinutes?); `data/collections.json` with sample tours (18th St Highlights, Pilsen Art Walk, Quick Five). Murals unchanged; tours reference mural IDs.
- **State**: `store/tourStore.ts` — `activeTour`, `setActiveTour`. `lib/collections.ts` — `getOrderedMuralsForCollection(collection, murals)`.
- **UI**: MapHeader — "Tours" button opens tour list; when `activeTour` set, title shows tour name and "Leave tour" button. TourList — bottom sheet listing tours (name, description, mural count, duration); tap sets active tour and closes. MapContent — when activeTour set, `displayMurals` = ordered tour murals; map, list, and modal prev/next use this set. MuralList — optional `listTitle` for tour mode (e.g. "Tour: 18th St Highlights — 5 stops").
- **Flow**: Default = all murals; "Tours" → pick tour → map/list show only tour murals in walking order; modal prev/next follow tour order; "Leave tour" resets.
- **Walking tour route UX**: When a tour is active, list thumbnails show a 1-based stop number badge (amber pill, top-left); map markers show the same number (bottom-right of thumbnail). Map draws a route line (amber LineString) connecting stops in order. MapContent passes `showTourNumbers` and `routeCoordinates` to MuralMap; MuralList infers tour mode from `listTitle` for badges; aria-labels include "Stop N" for list and markers.

## NearbyMuralCard enhancements (done)

- **Distance + address**: `lib/geo.ts` — `getMuralsWithinRadiusWithDistance`, `formatDistance(meters, locale)` (m vs ft by locale); `proximityStore` stores queue as `MuralWithDistance[]`, exposes `currentDistanceM`; card shows "~25 m away" and address line when non-empty.
- **Get directions**: `lib/directions.ts` — `getDirectionsUrl(mural)`, `getDirectionsGeoUri(mural)`; MuralModal imports from it; NearbyMuralCard has "Get directions" link (opens in new tab).
- **Tour context**: MapContent passes `activeTour` and `orderedMurals` (displayMurals) to NearbyMuralCard; card shows "Stop N of M" and optional tour name when current mural is in active tour; "Next: [title] (~X m away)" with distance to next stop via haversine.
- **Bearing hint**: `lib/geo.ts` — `bearingToDirectionText(degrees)`; card shows "Face north" / "Face east" etc. when `currentNearby.bearing` is set.
- **Card exit animation**: `proximityStore` — `exitDirection` for slide-out when advancing to next; enter/exit animations; respects `prefersReducedMotion`.
- **Dominant color**: Card uses `currentNearby.dominantColor` for a thin top border (`border-t-4`).
- **Seen (stored only)**: `proximityStore` — `markSeen(muralId)` and seen IDs in localStorage (`pilsen-murals-seen-murals`) kept for possible future use; Dismiss and View still call `markSeen`. Nearby queue is sorted by distance only (closest first) so users can loop through all nearby murals; seen no longer affects order.
- **Proximity distance**: `formatDistance` clamps to non-negative so distance never shows as negative (e.g. -275 ft).
- **Share**: "Share" button in card — Web Share API when available, else copy mural URL (`/?mural=id`) to clipboard with "Link copied" feedback.
- **Photo tip**: When `imageMetadata['Date taken']` exists, card shows short tip ("Photo taken in morning/afternoon — similar light now.").
- **Card shows only current mural**: Removed "X of Y nearby" text, full list of nearby murals, prev/next arrows, and swipe; card displays only the single current nearby mural. View/Dismiss still advance to next in queue. `requestFlyTo(mural, { openModalAfterFly: false })`; muralStore `pendingFlyTo` extended to `{ mural, openModalAfterFly }` so list/View/Surprise me still open modal on moveend.
- **Nearby card prev/next centers map**: Clicking the ←/→ arrows in the "You're near" card now calls `requestFlyTo(mural, { openModalAfterFly: false })` before advancing the card, so the map flies to center the newly selected mural.

## Map UX (done)

- **Fit all murals / Fit tour**: Header button "Fit map" (or "Fit tour" when a tour is active) fits the map bounds to all display murals with padding and maxZoom 16. `store/mapStore.ts`: `pendingFitBounds`, `requestFitBounds`; MuralMap subscribes and runs `fitBounds`; MapHeader triggers with `displayMurals` coordinates.
- **Layer toggle (Standard ↔ Satellite)**: Toggle in map controls (top-right) swaps style between `mapbox://styles/mapbox/standard` and `mapbox://styles/mapbox/satellite-streets-v12`. After `setStyle`, custom sources/layers (user dot, geofence, route line) are re-applied so they don’t disappear. Theme (light preset) only applied for Standard style.
- **Tour progress on map**: When a tour is active, header shows pill "Stop X of Y" and optional "Next: [title]". Uses `activeMural` + `displayMurals` for current stop index.
- **Compass reset**: Button in map controls calls `map.easeTo({ bearing: 0 })` for north-up. `mapStore`: `pendingCompassReset`, `requestCompassReset`.
- **View on map (modal)**: In MuralModal, "View on map" button closes the modal and flies to the mural without reopening (`requestFlyTo(activeMural, { openModalAfterFly: false })`). No mini-map in this iteration.
- **Map controls toolbar**: Default zoom +/- (NavigationControl) plus Fit, North compass, Satellite. One merged toolbar: Zoom+, Zoom-, Fit, Compass, Satellite. Custom icons minimal (14px, stroke 1.5, color #666); centered in 29×29 box.

## Accessibility (done)

- **Skip link**: "Skip to main content" link at top of body in `app/layout.tsx`; visually hidden until focused (`focus-visible`); targets `#main`. Main content in `app/page.tsx` has `id="main"` and `tabIndex={-1}` so it can receive focus after skip.
- **Focus trap and return**: `hooks/useFocusTrap.ts` — on dialog open, focus moves to first focusable inside container; Tab/Shift+Tab cycles within dialog; on close, focus restores to previously focused element. Used in MuralModal (panel + enlarged image), MuralList, and TourList.
- **Focus-visible rings**: Interactive controls use `focus-visible:ring-*` (and `focus-visible:ring-offset-*`) so focus rings show for keyboard users only, not on mouse click. Applied across MapHeader, MuralMap, MuralModal, MuralList, TourList, LocationPrompt, NearbyMuralCard, MuralMarker, ClusterMarker, and error page.

## Later

- **Murals data**: For 100+ murals or smaller initial payload, fetch murals from client (e.g. `fetch("/data/murals.json")`) after hydration; show map shell + loading state until data arrives.
- Replace placeholder images with real mural assets or CMS
- Optional: persist selected mural in URL (e.g. `?mural=mural-1`) for sharing

## More features (beyond submission)

- **Sharing & deep links**: URL with mural id (e.g. `/?mural=mural-1`) so opening the link scrolls/flys to that mural and opens modal; Open Graph / Twitter card so shared links show mural image + title.
- **Search / filter**: Search by title or artist; filter by artist (dropdown or chip list). Keeps map + list in sync (highlight or restrict to matches).
- **Favorites / “My list”**: LocalStorage (or optional account later) to save favorite murals; “Saved” view or filter; optional “plan a visit” list.
- **Offline / PWA**: Service worker + cache so map and key assets work offline; “Add to home screen” for app-like use while walking Pilsen.
- **More mural content**: Optional `description` or `story` in mural data; “About the artist” link; year or date added; tags (e.g. theme, style) for future filtering.
- **Discovery**: “Murals near you” (reuse geofence data); “Similar color” or “Same artist” from modal; “Finish this tour” progress (e.g. 3/5 stops).
- **Map UX**: Optional layer toggle (e.g. satellite vs standard); compass reset; “Fit all murals” button; optional mini-map in modal for context.
- **Analytics (privacy-friendly)**: Count mural views or tour starts (no PII); helps decide which tours to expand or which murals need better photos.
- **i18n**: Spanish (or language toggle) for labels and modal copy, given Pilsen’s community.
- **Background / PWA proximity notifications**: In-app alerts only while the tab is open. For "notify when nearby even when app closed": (1) **Native wrapper** — Capacitor or React Native with a background geolocation plugin to trigger local or push notifications on geofence enter; (2) **Server-side** — device registers with backend, server does geofencing and sends Web Push (or FCM) when user enters a mural zone; requires HTTPS, service worker, and backend.

## Opening to contributions (others adding murals)

- **Current**: Only you add murals via `raw-photos/` + `npm run sync-murals` (EXIF → murals.json + WebP). No auth or submission UI.
- **Options** (pick one path, then iterate):
  - **A — Low-friction (recommended first)**: "Submit a mural" page: form (photo upload, title, artist, optional address) + optional lat/lng from browser geolocation or map picker. Submissions go to a queue (email, Notion, Airtable, or a single JSON file in repo). You review, then run your existing pipeline (e.g. add photo to raw-photos, run sync-murals, merge into murals.json). No backend required; use a form service (Formspree, Tally) or static form + serverless (Vercel serverless saves to storage or sends email).
  - **B — Backend + queue**: Next.js API route(s): POST submission (multipart: image + JSON). Store image in Vercel Blob / S3 / Cloudinary and append to `data/submissions.json` (or DB). Admin page (or script) lists pending; approve → run generate-map-data on that image (or call a serverless that does it), then append to murals.json and redeploy. Adds storage + one-off processing.
  - **C — Full UGC**: Auth (e.g. NextAuth + Google/GitHub), DB (e.g. Supabase: users, murals, submissions). Submissions table with status (pending/approved/rejected). Approved rows become murals; image processing (dominant color, thumbnails) in API or background job. Map and list read from API or static build from DB. Enables attribution, moderation, and scaling.
- **Decisions to make**: (1) Anonymous vs attributed submissions. (2) Moderation: manual review before publish vs auto-publish with report flow. (3) Image storage: stay in repo (size/cap) vs cloud (Vercel Blob, Supabase Storage, Cloudinary). (4) Geofence: require Pilsen-area coordinates or allow city-wide and filter later.

## Mobile / native app UX (done)

- **MapHeader (mobile)**: Glass-style bar (`bg-white/85 backdrop-blur-xl`) with compact two-row layout; row 1 = title + mural count + time + sun icon; row 2 = segmented control (Surprise me | Browse | Tours) with 44px touch targets and active state. Desktop keeps pill buttons with `rounded-xl`. Header uses `safe-top`, `left-2 right-12` to leave room for map controls.
- **Bottom sheets**: MuralList and TourList use `rounded-t-3xl`, larger drag handle (`h-1.5 w-12`), `max-h-[55vh]`, and softer shadow for a native bottom-sheet feel.
- **MuralModal**: `safe-top safe-left safe-right` on the panel for notched devices; footer already uses `safe-bottom-footer`.
- **globals.css**: Added `@supports` glass-header utility for optional reuse.
- **Gentle loading states**: Map loads with a seamless overlay (bg-dynamic + `.loading-map-placeholder` soft pulse) that fades out over 500ms when the map is ready. Map loading overlay: white background in light mode (`#ffffff` in `.loading-map-placeholder`), gray in dark mode; centered "Loading map..." text with `role="status"` and `aria-live="polite"`. App route loading (`app/loading.tsx`) uses a full-page skeleton (header bar + map area) with `.loading-skeleton-soft` (2s soft opacity pulse); respects `prefers-reduced-motion`. Modal image placeholders use the same soft pulse and 300ms ease-out opacity transition for loaded images. See `globals.css` for `loading-shimmer-soft`, `loading-map-placeholder`, `loading-skeleton-soft`.

## Branding (done)

- **Site title and favicon**: Metadata title set to "The Pilsen Mural Project"; `app/icon.svg` is Mexican flag (green | white | red vertical stripes); MapHeader shows same title when no tour is active.

## Possible improvements (when you want to polish)

- **Error/loading**: `app/error.tsx` and `app/loading.tsx` added for better resilience and perceived load.
- **SEO/share**: Open Graph and Twitter card meta in `layout.tsx` for link previews; optional `og:image` from a mural or static asset.
- **Tests**: Unit tests for `lib/sunPilsen.ts`, `lib/collections.ts` (e.g. `getOrderedMuralsForCollection`), and store actions; keeps critical logic covered without full E2E.
- **Docs**: No separate docs site in repo; README + TODOS cover usage. Add a docs site only if you need public feature/API docs.
- **Version control**: Repo initialized; `.gitignore` added; initial commit on `main`, full app on `feature/current-work`; PR #1 merged. **PR #2** ([feature/proximity-geofence](https://github.com/tyler-morales/pilsen-murals/pull/2)): proximity, location, map UX, Pilsen boundary, a11y — ready to merge to main and share live link for feedback.
