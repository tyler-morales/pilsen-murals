import { NextRequest, NextResponse } from "next/server";
import { searchArtists } from "@/lib/db/client";

/**
 * GET /api/artists?q=<query>
 * Returns artists whose name matches the query (case-insensitive contains). For autocomplete.
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const artists = await searchArtists(q);
    return NextResponse.json(
      artists.map((a) => ({ id: a.id, name: a.name })),
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/artists error:", err);
    return NextResponse.json(
      { error: "We're having trouble loading artists. Please try again shortly." },
      { status: 503 }
    );
  }
}
