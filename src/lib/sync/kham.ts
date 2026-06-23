import { writeRawJson, readRawJson } from "@/lib/data";
import type { Place, SyncResult } from "@/types";

const LIST_URL = "https://www.kham.com.tw/application/UTK01/UTK0101_.aspx?Type=1";

interface KhamRaw {
  title: string;
  link: string;
}

// Fetch Kham ticketing page, parse event names and PRODUCT_ID links
export async function syncKham(): Promise<SyncResult> {
  try {
    const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items: KhamRaw[] = [];
    const seen = new Set<string>();

    // Match anchor tags whose href contains PRODUCT_ID
    const anchorRegex =
      /<a[^>]*href="([^"]*PRODUCT_ID=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null) {
      const link = match[1];
      const productId = link.match(/PRODUCT_ID=([^&"]+)/)?.[1] ?? "";
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);

      // Strip HTML tags from anchor body to get the event name
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      if (!title || title.length < 2) continue;

      items.push({
        title,
        // href 多為相對路徑（如 ../UTK02/...）；用 new URL 以列表頁為基底正確解析，
        // 避免字串相接產生 https://www.kham.com.tw../ 這種壞掉、會 404 的 URL。
        link: new URL(link, LIST_URL).href,
      });
    }

    writeRawJson("performances-kham.json", items);
    return { source: "kham", status: "success", count: items.length };
  } catch (e) {
    return {
      source: "kham",
      status: "error",
      count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Read raw Kham data and map to Place[]
export function khamPlaces(): Place[] {
  const raw: KhamRaw[] = readRawJson("performances-kham.json");
  return raw.map((item, i) => ({
    id: `kham-${i}`,
    name: item.title,
    type: "concert" as const,
    source: "kham",
    category: "indoor" as const,
    address: "台北市",
    district: "不限",
    sourceUrl: item.link,
    goodFor: "date" as const,
  }));
}
