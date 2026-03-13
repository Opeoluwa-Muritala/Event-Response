import * as cheerio from "cheerio";

export type Category =
  | "ai"
  | "war"
  | "disaster"
  | "good"
  | "politics"
  | "community"
  | "sports";

export type EventInput = {
  description: string;
  location: { lat: number; lng: number };
  status: "active" | "past" | "false" | "responded" | "deleted";
  timestamp: number;
  type: string;
  link?: string;
  imageUrl?: string;
  base64Image?: string;
  priceData?: { item: string; price: string; unit: string };
};

export const CATEGORIES: Category[] = [
  "ai",
  "war",
  "disaster",
  "good",
  "politics",
  "community",
  "sports",
];

/**
 * Scraper architecture (scaffold):
 * - Prefer RSS/Atom feeds where possible (stable + fast).
 * - Fall back to HTML scraping with Cheerio.
 * - Keep all outputs normalized to EventInput (your exact schema).
 * - Use a geocoding strategy for items that lack coordinates:
 *   - parse from article (sometimes embedded)
 *   - OR map by mentioned city/country using a geocoder (Nominatim/Google Geocoding)
 *   - OR store a conservative centroid (country/state) when exact coords unavailable.
 */
export async function scrapeAllCategories(): Promise<EventInput[]> {
  const out: EventInput[] = [];
  for (const c of CATEGORIES) {
    const items = await scrapeCategory(c);
    out.push(...items);
  }
  return out;
}

export async function scrapeCategory(category: Category): Promise<EventInput[]> {
  // TODO: configure real sources per category.
  // Example pattern:
  // - fetch feed(s)
  // - extract: title/summary/link/publishedAt
  // - categorize/type
  // - geocode to {lat,lng}
  // - return EventInput[]
  switch (category) {
    case "ai":
    case "war":
    case "disaster":
    case "good":
    case "politics":
    case "community":
    case "sports":
      return [];
  }
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "event-response-map/1.0 (+scraper)",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return await res.text();
}

export async function scrapeLinksFromPage(url: string): Promise<string[]> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "");
    if (!href) return;
    try {
      const abs = new URL(href, url).toString();
      links.add(abs);
    } catch {
      // ignore
    }
  });
  return [...links];
}

