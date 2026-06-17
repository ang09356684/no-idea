import { writeRawJson, readRawJson } from "@/lib/data";
import type { Place, SyncResult } from "@/types";

const LIST_URL = "https://ticket.mna.com.tw/UTK0101_";
const DETAIL_URL = (productId: string) =>
  `https://ticket.mna.com.tw/UTK0201_?PRODUCT_ID=${productId}`;

interface MnaRaw {
  title: string;
  date: string;
  venue: string; // 真實場館（來自詳情頁，必填，不留空/不杜撰）
  imageUrl?: string;
  link: string;
}

// Decode numeric and a few named HTML entities (頁面標題/內文為 hex entity 編碼)
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

const VENUE_KW =
  "(?:國家音樂廳|國家戲劇院|國家歌劇院|小巨蛋|大巨蛋|流行音樂中心|音樂廳|演藝廳|文化中心|展演中心|展演廳|歌劇院|劇院|劇場|體育館|體育場|藝術中心|表演廳|大會堂|會展中心|展覽館)";
const CITY =
  "(?:臺北|台北|新北|桃園|臺中|台中|臺南|台南|高雄|基隆|新竹|宜蘭|花蓮|臺東|台東|嘉義|彰化|雲林|南投|苗栗|屏東)";

// 從詳情頁「節目場次」區塊抓真實場館（CMS 自由文字，標籤會把字拆開，故先去標籤+去空白）。
// 回傳「去重、保留出現順序」的場館清單：同場館不同時間 → 1 筆；巡演不同場館 → 多筆。
function extractVenues(html: string): string[] {
  const decoded = decodeEntities(html);
  const idx = decoded.indexOf("節目場次");
  const seg = (idx >= 0 ? decoded.slice(idx, idx + 1500) : decoded)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "");
  const re = new RegExp(CITY + "[\\u4e00-\\u9fff]{0,6}?" + VENUE_KW, "g");
  const venues: string[] = [];
  for (const m of seg.matchAll(re)) {
    if (!venues.includes(m[0])) venues.push(m[0]);
  }
  return venues;
}

// 場館 → 行政區（對應首頁篩選用）。對不到的回傳「其他」，城市篩選仍靠 address 字串比對
function venueToDistrict(venue: string): string {
  const map: [RegExp, string][] = [
    // 臺中（放最前，避免被台北的泛用規則如「中山堂」誤判）
    [/臺中國家歌劇院|臺中歌劇院/, "西屯區"],
    [/臺中.*中山堂/, "中區"],
    // 臺北
    [/國家音樂廳|國家戲劇院|兩廳院|中山堂/, "中正區"],
    [/流行音樂中心|南港展覽館|南港/, "南港區"],
    [/小巨蛋|松菸|文創/, "松山區"],
    [/世貿|國際會議中心|TICC|信義/, "信義區"],
    [/表演藝術中心|故宮|士林/, "士林區"],
  ];
  for (const [re, d] of map) if (re.test(venue)) return d;
  // 場館字串本身若已含「X區」直接採用（縣市前綴由 combine 的 normalizeDistrict 補上）
  const m = venue.match(/(.{2,3}區)/);
  if (m) return m[1];
  return "其他";
}

// Fetch MNA (年代旗下) 售票列表頁，再逐筆抓詳情頁取得真實場館
export async function syncMna(): Promise<SyncResult> {
  try {
    const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    // 先從列表頁解析 標題/日期/圖片/連結 與 PRODUCT_ID
    const blockRegex =
      /<a[^>]*href="([^"]*PRODUCT_ID=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const listed: {
      productId: string;
      title: string;
      date: string;
      imageUrl?: string;
      link: string;
    }[] = [];
    const seen = new Set<string>();
    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const link = match[1];
      const block = match[2];
      const productId = link.match(/PRODUCT_ID=([^&"]+)/)?.[1] ?? "";
      if (!productId || seen.has(productId)) continue;

      const titleMatch = block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); // banner anchor 無 h1
      if (!titleMatch) continue;
      const title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, "")).trim();
      if (!title || title.length < 2) continue;

      seen.add(productId);
      const dateMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const imgMatch = block.match(/background-image:\s*url\(([^)]+)\)/i);
      listed.push({
        productId,
        title,
        date: dateMatch?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "",
        imageUrl: imgMatch?.[1]?.replace(/['"]/g, "").trim(),
        link: link.startsWith("http")
          ? link
          : `https://ticket.mna.com.tw${link}`,
      });
    }

    // 逐筆抓詳情頁取場館（並行）。場館是必要資訊：抓不到就不收錄，不留空/不杜撰。
    // 一個節目若橫跨多個不同場館（巡演），每個場館各產生一筆
    const items: MnaRaw[] = [];
    await Promise.all(
      listed.map(async (it) => {
        try {
          const dres = await fetch(DETAIL_URL(it.productId), {
            signal: AbortSignal.timeout(10000),
          });
          const venues = extractVenues(await dres.text());
          for (const venue of venues) {
            items.push({
              title: it.title,
              date: it.date,
              venue,
              imageUrl: it.imageUrl,
              link: it.link,
            });
          }
        } catch {
          // 詳情頁抓取失敗 → 略過該筆（不寫入無場館資料）
        }
      })
    );

    writeRawJson("performances-mna.json", items);
    return { source: "mna", status: "success", count: items.length };
  } catch (e) {
    return {
      source: "mna",
      status: "error",
      count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function mnaPlaces(): Place[] {
  const raw: MnaRaw[] = readRawJson("performances-mna.json");
  return raw.map((item, i) => ({
    id: `mna-${i}`,
    name: item.title,
    type: "concert" as const,
    source: "mna",
    category: "indoor" as const,
    address: item.venue, // 真實場館
    district: venueToDistrict(item.venue),
    imageUrl: item.imageUrl,
    sourceUrl: item.link,
    goodFor: "both" as const,
  }));
}
