import { MapContent } from "@/components/MapContent";
import muralsData from "@/data/murals.json";
import collectionsData from "@/data/collections.json";
import type { Mural } from "@/types/mural";
import type { Collection } from "@/types/collection";

export default function Home() {
  const murals = muralsData as unknown as Mural[];
  const collections = collectionsData as unknown as Collection[];

  return (
    <main id="main" className="fixed inset-0 h-screen w-screen" tabIndex={-1}>
      <MapContent murals={murals} collections={collections} />
    </main>
  );
}
