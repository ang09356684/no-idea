import { writeRawJson, readRawJson } from "@/lib/data";
import type { Place, SyncResult } from "@/types";

const URL = "https://www.atmovies.com.tw/movie/now/";

interface AtmoviesRaw {
  title: string;
  releaseDate?: string;
  duration?: string;
  rating?: string;
  link: string;
}

export async function syncAtmovies(): Promise<SyncResult> {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items: AtmoviesRaw[] = [];
    const seen = new Set<string>();

    // Pattern: links to movie detail pages /movie/f{id}/
    // Title is on the next line after the <a> tag
    const movieRegex =
      /href="(\/movie\/f[a-zA-Z0-9]+\/)"[^>]*>\s*([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = movieRegex.exec(html)) !== null) {
      const link = match[1];
      if (seen.has(link)) continue;
      seen.add(link);

      const title = match[2].replace(/<[^>]*>/g, "").trim();
      if (!title || title.length < 2 || title.length > 80) continue;

      // Look for date, duration, rating nearby
      const start = Math.max(0, match.index - 200);
      const end = Math.min(html.length, match.index + 300);
      const context = html.slice(start, end);

      const dateMatch = context.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
      const durationMatch = context.match(/\((\d+)分\)/);
      const ratingMatch = context.match(
        /cer_([A-Z0-9]+)\./i
      );

      items.push({
        title,
        releaseDate: dateMatch?.[1]?.replaceAll("/", "-"),
        duration: durationMatch?.[1],
        rating: ratingMatch?.[1],
        link: `https://www.atmovies.com.tw${link}`,
      });
    }

    writeRawJson("movies-atmovies.json", items);
    return { source: "atmovies", status: "success", count: items.length };
  } catch (e) {
    return {
      source: "atmovies",
      status: "error",
      count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function atmoviesPlaces(): Place[] {
  const raw: AtmoviesRaw[] = readRawJson("movies-atmovies.json");
  return raw.map((item, i) => ({
    id: `atm-${i}`,
    name: item.title,
    type: "movie" as const,
    source: "atmovies",
    category: "indoor" as const,
    // 電影本無固定地點（全台各大影城皆有上映）；用不含縣市字樣的中性標籤，
    // 讓嚴格地點篩選把它視為「地點不明」，可在任何縣市/區作為補充（plan 14）
    address: "全台各大影城",
    district: "不限",
    sourceUrl: item.link,
    startDate: item.releaseDate,
    goodFor: "both" as const,
    price: item.duration ? `${item.duration}分鐘` : undefined,
  }));
}
