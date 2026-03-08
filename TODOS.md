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
- **Number clusters when zoomed out**: Supercluster clusters mural points by zoom/viewport; when zoomed out, numbered cluster markers (e.g. "5") replace overlapping thumbnails. Clicking a cluster zooms in to expand it. Individual mural thumbnails show when zoomed in. `ClusterMarker` component; `MuralMap` builds index from murals, runs `getClusters` on zoom/move and swaps cluster vs mural markers accordingly.
- **Responsiveness/speed (Mar 2025)**: MapHeader reads `pilsenTimeString` from theme store (one 60s tick for time + preset). Theme store and ThemeByPilsenTime document that subscribers must stay minimal. MuralModal uses blurred thumbnail (or imageUrl) as placeholder while full-size image loads (panel + enlarged view). `lib/muralBuildingLayer.ts` has top-of-file notes for future use: viewport culling, texture reuse/thumbnails, minimize triggerRepaint. MuralList virtualized with `@tanstack/react-virtual` (fixed row height, ul/li, a11y). Murals data: client fetch deferred; current server pass kept; for many murals or lighter shell, fetch `/data/murals.json` (or API) from client after hydration and show loading state.

## Refactor / Cleanup (done, continued)

- **Mural images → WebP**: Pipeline now outputs WebP for smaller size and faster loading. `generate-map-data.js` writes `.webp` paths; `sync-murals.js` converts source images to WebP (high-res at quality 88, thumbnails at 400px max width and quality 82), removes orphaned files by expected .webp names. Cache version bumped so next sync regenerates murals.json with .webp paths.
- **Mobile-first**: Viewport export in `app/layout.tsx` (`viewportFit: "cover"`, `themeColor`). Safe-area utilities in `app/globals.css` (`.safe-top`, `.safe-bottom`, `.safe-left`, `.safe-right`, `.safe-bottom-footer`). MapHeader: mobile-default compact layout (`left-2 right-14`, `max-w-[calc(100%-3.5rem)]`), `sm:` for larger spacing; dynamic theme (`bg-dynamic-surface`, `text-dynamic`, `text-dynamic-muted`, `border-dynamic`); 44px min touch targets. MuralList: safe-bottom on sheet; drag handle at top. MuralModal: safe-area on footer (`.safe-bottom-footer`) and enlarged overlay (safe-top/right/bottom/left); 44px min height on footer and close buttons. MuralMarker: 44px minimum touch target (button grows, thumbnail visual unchanged).

## Collections / Walking tours (done)

- **Data**: `types/collection.ts` (Collection: id, name, description?, muralIds, estimatedMinutes?); `data/collections.json` with sample tours (18th St Highlights, Pilsen Art Walk, Quick Five). Murals unchanged; tours reference mural IDs.
- **State**: `store/tourStore.ts` — `activeTour`, `setActiveTour`. `lib/collections.ts` — `getOrderedMuralsForCollection(collection, murals)`.
- **UI**: MapHeader — "Tours" button opens tour list; when `activeTour` set, title shows tour name and "Leave tour" button. TourList — bottom sheet listing tours (name, description, mural count, duration); tap sets active tour and closes. MapContent — when activeTour set, `displayMurals` = ordered tour murals; map, list, and modal prev/next use this set. MuralList — optional `listTitle` for tour mode (e.g. "Tour: 18th St Highlights — 5 stops").
- **Flow**: Default = all murals; "Tours" → pick tour → map/list show only tour murals in walking order; modal prev/next follow tour order; "Leave tour" resets.
- **Walking tour route UX**: When a tour is active, list thumbnails show a 1-based stop number badge (amber pill, top-left); map markers show the same number (bottom-right of thumbnail). Map draws a route line (amber LineString) connecting stops in order. MapContent passes `showTourNumbers` and `routeCoordinates` to MuralMap; MuralList infers tour mode from `listTitle` for badges; aria-labels include "Stop N" for list and markers.

## Later

- **Murals data**: For 100+ murals or smaller initial payload, fetch murals from client (e.g. `fetch("/data/murals.json")`) after hydration; show map shell + loading state until data arrives.
- Replace placeholder images with real mural assets or CMS
- Optional: persist selected mural in URL (e.g. `?mural=mural-1`) for sharing
- Optional: a11y focus trap and focus return when modal closes

## Mobile / native app UX (done)

- **MapHeader (mobile)**: Glass-style bar (`bg-white/85 backdrop-blur-xl`) with compact two-row layout; row 1 = title + mural count + time + sun icon; row 2 = segmented control (Surprise me | Browse | Tours) with 44px touch targets and active state. Desktop keeps pill buttons with `rounded-xl`. Header uses `safe-top`, `left-2 right-12` to leave room for map controls.
- **Bottom sheets**: MuralList and TourList use `rounded-t-3xl`, larger drag handle (`h-1.5 w-12`), `max-h-[55vh]`, and softer shadow for a native bottom-sheet feel.
- **MuralModal**: `safe-top safe-left safe-right` on the panel for notched devices; footer already uses `safe-bottom-footer`.
- **globals.css**: Added `@supports` glass-header utility for optional reuse.
- **Gentle loading states**: Map loads with a seamless overlay (bg-dynamic + `.loading-map-placeholder` soft pulse) that fades out over 500ms when the map is ready. App route loading (`app/loading.tsx`) uses a full-page skeleton (header bar + map area) with `.loading-skeleton-soft` (2s soft opacity pulse); respects `prefers-reduced-motion`. Modal image placeholders use the same soft pulse and 300ms ease-out opacity transition for loaded images. See `globals.css` for `loading-shimmer-soft`, `loading-map-placeholder`, `loading-skeleton-soft`.

## Possible improvements (when you want to polish)

- **Error/loading**: `app/error.tsx` and `app/loading.tsx` added for better resilience and perceived load.
- **SEO/share**: Open Graph and Twitter card meta in `layout.tsx` for link previews; optional `og:image` from a mural or static asset.
- **Tests**: Unit tests for `lib/sunPilsen.ts`, `lib/collections.ts` (e.g. `getOrderedMuralsForCollection`), and store actions; keeps critical logic covered without full E2E.
- **Docs**: No separate docs site in repo; README + TODOS cover usage. Add a docs site only if you need public feature/API docs.
- **Version control**: Repo initialized; `.gitignore` added; initial commit on `main`, full app on `feature/current-work`; PR #1 open to merge current work into main.
