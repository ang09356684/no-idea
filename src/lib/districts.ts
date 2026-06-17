// 共用的縣市 / 行政區資料與輔助函式。
// 同時被 client (InputForm) 與 server (generate / combine) 使用，故只放純資料與純函式，
// 不可 import fs 等 server-only 模組。
//
// 行政區清單來源：vinta 的台灣縣市行政區清單
// https://gist.github.com/vinta/079cb8d4da486f471365c31388ed1b85
//
// ⚠️ 跨縣市同名行政區（如「大安區」台北、台中都有）採「縣市+區」複合鍵（對策 A），
// 例：臺北市大安區 / 臺中市大安區，比對與 UI value 都用複合鍵。

// 城市顯示順序（首頁地點篩選用，"不限" 由 InputForm 自行前綴）
export const CITIES = ["台北", "桃園", "宜蘭", "台中"] as const;

// 城市 → address 字串比對用的關鍵字（city-wide 篩選）
export const CITY_KEYWORDS: Record<string, string[]> = {
  台北: ["臺北", "台北"],
  桃園: ["桃園"],
  宜蘭: ["宜蘭"],
  台中: ["臺中", "台中"],
};

// 城市 → 複合鍵前綴用的正規縣市全名
export const CITY_FULL: Record<string, string> = {
  台北: "臺北市",
  桃園: "桃園市",
  宜蘭: "宜蘭縣",
  台中: "臺中市",
};

export const CITY_DISTRICTS: Record<string, string[]> = {
  台北: [
    "中正區", "大安區", "信義區", "中山區", "松山區", "大同區",
    "萬華區", "士林區", "北投區", "文山區", "南港區", "內湖區",
  ],
  桃園: [
    "桃園區", "中壢區", "平鎮區", "八德區", "楊梅區", "蘆竹區",
    "龜山區", "大園區", "觀音區", "新屋區", "大溪區", "龍潭區", "復興區",
  ],
  宜蘭: [
    "宜蘭市", "羅東鎮", "蘇澳鎮", "頭城鎮", "礁溪鄉", "壯圍鄉",
    "員山鄉", "冬山鄉", "五結鄉", "三星鄉", "大同鄉", "南澳鄉",
  ],
  台中: [
    "中區", "東區", "南區", "西區", "北區", "北屯區", "西屯區", "南屯區",
    "太平區", "大里區", "霧峰區", "烏日區", "豐原區", "后里區", "東勢區",
    "石岡區", "新社區", "和平區", "神岡區", "潭子區", "大雅區", "大肚區",
    "龍井區", "沙鹿區", "梧棲區", "清水區", "大甲區", "外埔區", "大安區",
  ],
};

// 複合鍵：("台北", "大安區") → "臺北市大安區"
export function districtKey(city: string, district: string): string {
  return (CITY_FULL[city] ?? "") + district;
}

// address 字串中出現哪個城市關鍵字，回傳城市 key（台北/桃園/…），找不到回 null
export function cityOf(address: string): string | null {
  for (const city of Object.keys(CITY_KEYWORDS)) {
    if (CITY_KEYWORDS[city].some((kw) => address.includes(kw))) return city;
  }
  return null;
}

// 把各來源的 (address, 原始 district) 正規化成複合鍵。
// - "不限" 原樣保留
// - 能判定縣市且 district 是真實行政區 → "縣市全名 + 行政區"
// - district 抓不到（"其他"/空）但 address 含行政區字樣 → 從 address 補
// - 都判不出 → "其他"
export function normalizeDistrict(address: string, district: string): string {
  if (district === "不限") return "不限";
  const city = cityOf(address);
  if (!city) return district || "其他";

  const isRealDistrict = /[區鄉鎮市]$/.test(district) && district !== "其他";
  if (isRealDistrict) return CITY_FULL[city] + district;

  const m = address.match(/[市縣](.{1,3}?[區鄉鎮市])/);
  if (m) return CITY_FULL[city] + m[1];
  return "其他";
}

// 複合鍵去掉縣市前綴供顯示："臺北市大安區" → "大安區"
export function districtDisplay(district: string): string {
  for (const full of Object.values(CITY_FULL)) {
    if (district.startsWith(full) && district.length > full.length) {
      return district.slice(full.length);
    }
  }
  return district;
}

// 行政區短標籤（chip 顯示用）："大安區" → "大安"、"羅東鎮" → "羅東"。
// 去字尾後若不足 2 字（如台中「中區/東區」會變單字「中/東」難辨識）則保留原名。
export function districtShortLabel(district: string): string {
  const short = district.replace(/[區鄉鎮市]$/, "");
  return short.length >= 2 ? short : district;
}
