# Pilsen Murals — 3D Interactive Map

Proof of concept for a high-end, dynamic-lighting “digital twin” map of street art and murals. Built with Next.js (App Router), Mapbox GL JS v3, Framer Motion, and Zustand. Lighting is driven by the sun's position over Pilsen (Chicago) and updates every 60 seconds.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Mapbox Access Token**

   Create a [Mapbox account](https://account.mapbox.com/) and copy your default public token. Then either:

   - Add to `.env.local`:
     ```bash
     NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
     ```
   - Or temporarily in `components/MuralMap.tsx`: set `MAPBOX_TOKEN = "pk.…"` (see comment at top of file).

3. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Testing

Tests use Vitest and React Testing Library. Run once: `npm run test`. Watch mode: `npm run test:watch`. Coverage: `npm run test:coverage`. Marker thumbnail pins use a staggered drop (10px) + fade-in on load; `prefers-reduced-motion` skips the animation.

## Features

- **Dynamic lighting**: UI and map lighting are driven by the **sun’s position** over Pilsen, Chicago (America/Chicago). Brightness updates **every 60 seconds** so dawn, noon, dusk, and night each have distinct lighting—not just a switch at sunrise/sunset.
- **Map**: Full-screen Mapbox dark style with 3D building extrusions (matte silhouettes), plus a time-of-day overlay that lightens the map by sun altitude.
- **Markers**: Thumbnail image pins per mural from `data/murals.json`; each pin drops ~10px and fades in with a short stagger on load. Glow uses each mural’s dominant color. Respects `prefers-reduced-motion`.
- **Fly-to**: Click a marker to fly the camera to street level with pitch; when the animation ends, the detail modal opens.
- **Modal**: Slide-in panel (Framer Motion) with editorial layout: image, title, artist, address, and dominant color swatch. State is managed with Zustand (`activeMural`, modal open/closed).
- **Proximity alerts**: On first load you can enable location; when you’re within ~80 m of a mural, a card appears with the closest mural (and “View” / “Dismiss”). If several murals are nearby, the queue shows the next after you dismiss or view. Alerts work only while the app is open; true background notifications would require a native app or server-side geofencing + push.

## Lighthouse / SEO

Run Lighthouse against the **production** URL when measuring SEO and crawlability. Vercel sets `x-robots-tag: noindex` on **preview** deployments (e.g. `*-tyler-morales-projects.vercel.app`); the production deployment (e.g. main branch URL) does not send this header.

## Stack

- Next.js 15 (App Router), React 18
- TailwindCSS, Framer Motion, Zustand, SunCalc (sun position)
- Mapbox GL JS v3

## Data

Edit `data/murals.json` to add or change murals. Each entry needs: `id`, `title`, `artist`, `coordinates` `[lng, lat]`, `dominantColor` (hex), `imageUrl`, `address`.

To generate `murals.json` from photos with EXIF GPS: put `.jpg`/`.jpeg`/`.heic` files in `raw-photos/`, then run **`npm run sync-murals`**. That regenerates from EXIF, updates `data/murals.json`, and syncs images to `public/images/murals/`. Run it again whenever you add new photos.
