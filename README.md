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
- **Markers**: Thumbnail image pins per mural (from canonical DB or fallback `data/murals.json`); each pin drops ~10px and fades in with a short stagger on load. Glow uses each mural’s dominant color. Respects `prefers-reduced-motion`.
- **Fly-to**: Click a marker to fly the camera to street level with pitch; when the animation ends, the detail modal opens.
- **Modal**: Slide-in panel (Framer Motion) with editorial layout: image, title, artist, address, and dominant color swatch. State is managed with Zustand (`activeMural`, modal open/closed).
- **Proximity alerts**: On first load you can enable location; when you’re within ~80 m of a mural, a card appears with the closest mural (and “View” / “Dismiss”). If several murals are nearby, the queue shows the next after you dismiss or view. Alerts work only while the app is open; true background notifications would require a native app or server-side geofencing + push.

## Lighthouse / SEO

Run Lighthouse against the **production** URL when measuring SEO and crawlability. Vercel sets `x-robots-tag: noindex` on **preview** deployments (e.g. `*-tyler-morales-projects.vercel.app`); the production deployment (e.g. main branch URL) does not send this header.

## Stack

- Next.js 15 (App Router), React 18
- TailwindCSS, Framer Motion, Zustand, SunCalc (sun position)
- Mapbox GL JS v3

## Vector search (Qdrant + CLIP)

Visual similarity search: upload a mural photo and find if it’s already in the system. **Qdrant is a derived search index**; the canonical source of truth for map content is the murals DB (or `data/murals.json` fallback when DB is not configured).

1. **Env** — In `.env.local` set:
   - `QDRANT_URL` — Qdrant Cloud cluster URL (e.g. `https://xxx.cloud.qdrant.io`)
   - `QDRANT_API_KEY` — API key for the cluster

2. **Create collection** (once):
   ```bash
   npm run qdrant:setup
   ```
   This creates the `pilsen_murals` collection (512-d vectors, Cosine distance) for CLIP embeddings.

3. **Backfill from existing data** (optional): To index all murals in `data/murals.json` into Qdrant, run **`npm run backfill-qdrant`**. Images are read from `public/` (relative `imageUrl`). Optional env `BASE_URL` (e.g. `http://localhost:3000`) to fetch images from a URL instead.

4. **APIs**
   - **GET /api/murals** — Returns all murals from the canonical DB (app shape). 503 if DB unavailable.
   - **POST /api/murals** — Learning only: add another image vector to an existing mural (FormData: `image`, `muralId`) or index by JSON (embedding/imageUrl). Does not create map records; use **POST /api/murals/submit** for new community murals.
  - **POST /api/murals/submit** — Community submission: FormData with `turnstileToken`, `image`, optional `title`, `artist`, `lat`, `lng`. Verifies Turnstile, processes image to WebP (full-resolution display + thumbnail), uploads to storage, inserts mural in DB, and upserts embedding in Qdrant. Auto-publishes to the map.
   - **POST /api/search** — Search by image: send either `multipart/form-data` with an image file (field `image` or `file`) or JSON `{ "imageUrl": "https://..." }`. Returns top 3 similar murals as `{ results: [ { id, score, payload } ] }` (higher score = more similar). In production (e.g. Vercel), request body size is limited (~4.5MB); the Check a mural flow normalizes file uploads client-side (resize to 1600px long edge, JPEG re-encode) so gallery images stay under the limit and avoid 413.

## Community uploads and canonical data

Map content is read from **Supabase** (murals table + storage). When Supabase is not configured or fails, the app falls back to **`data/murals.json`** (e.g. during migration or local dev without DB).

1. **Env** — In `.env.local` set:
   - `SUPABASE_URL` — Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-only)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — Cloudflare Turnstile (invisible) site key
   - `TURNSTILE_SECRET_KEY` — Turnstile secret for server verification

2. **DB and storage** — Run the migration in `supabase/migrations/20250310000000_murals.sql` (Supabase SQL editor or `supabase db push`). Create a **public** storage bucket named `murals` in the Supabase dashboard.

3. **Flow** — User taps “Check a mural”, captures or uploads a photo. The photo is sent only to **POST /api/search** (visual similarity); nothing is written to Supabase or the DB at this step. Persistence happens only when the user explicitly taps "Add to database": Turnstile (invisible) runs, then **POST /api/murals/submit** processes the image (WebP display + thumb, dominant color, optional EXIF), uploads to Supabase Storage, inserts a row in `murals`, and upserts the CLIP embedding into Qdrant. The new mural appears on the map on next load (or when the map data is refetched).

4. **Seed DB from JSON** — To populate the Supabase `murals` table from `data/murals.json`, run **`npm run seed-murals-db`** (requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`). Uses upsert on `id` so re-runs are safe.

5. **Manual pipeline (optional)** — For bulk imports from your own photos: put files in `raw-photos/`, run **`npm run sync-murals`** to generate WebP and update `data/murals.json`, then **`npm run seed-murals-db`** to push into Supabase (and optionally **`npm run backfill-qdrant`** for vector search).

## Data

**Canonical source**: Supabase `murals` table (see Community uploads above). **Fallback**: `data/murals.json`. Each mural needs: `id`, `title`, `artist`, `coordinates` `[lng, lat]`, `dominantColor` (hex), `imageUrl`, and optionally `thumbnail`, `imageMetadata`.

To generate `murals.json` from photos with EXIF GPS: put `.jpg`/`.jpeg`/`.heic` files in `raw-photos/`, then run **`npm run sync-murals`**. That regenerates from EXIF, updates `data/murals.json`, and syncs images to `public/images/murals/`. Run it again whenever you add new photos. Use this for initial seed data; ongoing community submissions go through **POST /api/murals/submit**.
