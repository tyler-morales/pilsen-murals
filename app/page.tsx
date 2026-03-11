import { MapContent } from "@/components/MapContent";
import { getMuralsForMap } from "@/lib/db/murals";
import collectionsData from "@/data/collections.json";
import type { Collection } from "@/types/collection";

export const dynamic = "force-dynamic";

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
