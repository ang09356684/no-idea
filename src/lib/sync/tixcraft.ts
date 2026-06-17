import { writeRawJson, readRawJson } from "@/lib/data";
import type { Place, SyncResult } from "@/types";

const URL = "https://tixcraft.com/activity";

interface TixcraftRaw {
  title: string;
  date: string;
  venue: string;
  imageUrl?: string;
  link: string;
}

export async function syncTixcraft(): Promise<SyncResult> {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items: TixcraftRaw[] = [];
    const seen = new Set<string>();

    // Structure: <a href="/activity/detail/{id}"> wraps image
    // Then: <div>date</div> <a href="...">title</a> <div>venue</div>
    // Find all activity detail links with surrounding context
    const linkRegex = /href="(\/activity\/detail\/[^"]+)"/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const link = match[1];
      if (seen.has(link)) continue;
      seen.add(link);

      // Get context around this link (1000 chars after)
      const start = match.index;
      const end = Math.min(html.length, start + 1500);
      const context = html.slice(start, end);

      // Extract image
      const imgMatch = context.match(
        /src="(https:\/\/static\.tixcraft\.com\/images\/activity\/[^"]+)"/
      );

      // Extract title — the text inside <a> that links to the same detail page
      const titleMatch = context.match(
        new RegExp(
          `href="${link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([^<]+)<\\/a>`
        )
      );

      // Extract date
      const dateMatch = context.match(
        /(\d{4}\/\d{2}\/\d{2}[^<]*(?:~[^<]*)?)/
      );

      // Extract venue — typically a <div> after the date containing venue name
      const venueKeywords =
        /(?:小巨蛋|國家體育場|流行音樂中心|大巨蛋|Legacy|TICC|南港展覽館|高雄巨蛋|新莊體育館|台北國際會議中心|兩廳院|國家音樂廳|國家戲劇院|Zepp|ATT SHOW BOX)[^<]*/;
      const venueMatch = context.match(venueKeywords);

      const title = titleMatch?.[1]?.trim() ?? "";
      if (!title || title.length < 3 || title === "Event Info") continue;

      items.push({
        title,
        date: dateMatch?.[1]?.trim() ?? "",
        venue: venueMatch?.[0]?.trim() ?? "",
        imageUrl: imgMatch?.[1],
        link: `https://tixcraft.com${link}`,
      });
    }

    writeRawJson("performances-tixcraft.json", items);
    return { source: "tixcraft", status: "success", count: items.length };
  } catch (e) {
    return {
      source: "tixcraft",
      status: "error",
      count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function isTaipei(venue: string): boolean {
  const taipeiVenues = [
    "台北",
    "臺北",
    "小巨蛋",
    "大巨蛋",
    "TICC",
    "Legacy",
    "兩廳院",
    "國家音樂廳",
    "國家戲劇院",
    "南港",
    "Zepp",
    "ATT SHOW",
    "流行音樂中心",
    "國際會議中心",
  ];
  return taipeiVenues.some((kw) => venue.includes(kw));
}

function venueToDistrict(venue: string): string {
  if (venue.includes("小巨蛋")) return "松山區";
  if (venue.includes("大巨蛋")) return "信義區";
  if (venue.includes("南港")) return "南港區";
  if (venue.includes("兩廳院") || venue.includes("國家音樂廳") || venue.includes("國家戲劇院"))
    return "中正區";
  if (venue.includes("流行音樂中心")) return "南港區";
  return "不限";
}

export function tixcraftPlaces(): Place[] {
  const raw: TixcraftRaw[] = readRawJson("performances-tixcraft.json");
  return raw
    .filter((item) => !item.venue || isTaipei(item.venue))
    .map((item, i) => ({
      id: `tixcraft-${i}`,
      name: item.title,
      type: "concert" as const,
      source: "tixcraft",
      category: "indoor" as const,
      // 此來源已過濾為台北場館，但部分場館名（如「大巨蛋」）不含縣市字樣，
      // 補上「臺北市」前綴，讓 combine 的 normalizeDistrict 能正確產生複合鍵
      address: item.venue
        ? /臺北|台北/.test(item.venue)
          ? item.venue
          : `臺北市${item.venue}`
        : "臺北市",
      district: venueToDistrict(item.venue),
      imageUrl: item.imageUrl,
      sourceUrl: item.link,
      startDate: item.date
        ?.match(/\d{4}\/\d{2}\/\d{2}/)?.[0]
        ?.replaceAll("/", "-"),
      goodFor: "date" as const,
    }));
}
