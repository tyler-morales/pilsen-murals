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

## Features

- **Dynamic lighting**: UI and map lighting are driven by the **sun’s position** over Pilsen, Chicago (America/Chicago). Brightness updates **every 60 seconds** so dawn, noon, dusk, and night each have distinct lighting—not just a switch at sunrise/sunset.
- **Map**: Full-screen Mapbox dark style with 3D building extrusions (matte silhouettes), plus a time-of-day overlay that lightens the map by sun altitude.
- **Markers**: 3D Sims-style diamond markers (CSS 3D: rotating gem + subtle float) per mural from `data/murals.json`; glow uses each mural’s dominant color. Respects `prefers-reduced-motion`.
- **Fly-to**: Click a marker to fly the camera to street level with pitch; when the animation ends, the detail modal opens.
- **Modal**: Slide-in panel (Framer Motion) with editorial layout: image, title, artist, address, and dominant color swatch. State is managed with Zustand (`activeMural`, modal open/closed).

## Stack

- Next.js 15 (App Router), React 18
- TailwindCSS, Framer Motion, Zustand, SunCalc (sun position)
- Mapbox GL JS v3

## Data

Edit `data/murals.json` to add or change murals. Each entry needs: `id`, `title`, `artist`, `coordinates` `[lng, lat]`, `dominantColor` (hex), `imageUrl`, `address`.

To generate `murals.json` from photos with EXIF GPS: put `.jpg`/`.jpeg`/`.heic` files in `raw-photos/`, then run **`npm run sync-murals`**. That regenerates from EXIF, updates `data/murals.json`, and syncs images to `public/images/murals/`. Run it again whenever you add new photos.
