import type { Metadata } from "next";
import { MapContent } from "@/components/MapContent";
import { selectMuralById } from "@/lib/db/client";
import { getMuralsForMap } from "@/lib/db/murals";
import collectionsData from "@/data/collections.json";
import type { Collection } from "@/types/collection";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ mural?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const muralId = typeof params.mural === "string" ? params.mural : undefined;

  if (muralId) {
    try {
      const row = await selectMuralById(muralId);
      if (row) {
        const title = `${row.title} — The Pilsen Mural Project`;
        const description =
          row.artist !== "Unknown Artist"
            ? `"${row.title}" by ${row.artist} in Pilsen, Chicago`
            : `"${row.title}" in Pilsen, Chicago`;
        return {
          title,
          description,
          openGraph: { title, description, images: [row.image_url] },
          twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [row.image_url],
          },
        };
      }
    } catch {
      // fall through to defaults
    }
  }

  return {};
}

export default async function Home() {
  const [murals, collections] = await Promise.all([
    getMuralsForMap(),
    Promise.resolve(collectionsData as unknown as Collection[]),
  ]);

  return (
    <main id="main" className="fixed inset-0 h-screen w-screen" tabIndex={-1}>
      <MapContent murals={murals} collections={collections} />
    </main>
  );
}
