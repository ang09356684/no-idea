import { readCombinedPlaces } from "@/lib/data";
import { CITY_FULL, addressCity, placeDistrictKey } from "@/lib/districts";
import type { Place, Itinerary, GenerateRequest } from "@/types";
import { randomUUID } from "crypto";

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isActivity(p: Place): boolean {
  return ["exhibition", "concert", "music", "theater", "movie", "attraction"].includes(p.type);
}

function isFood(p: Place): boolean {
  return p.type === "food";
}

function matchesType(place: Place, typeFilters: string[]): boolean {
  if (typeFilters.includes("all")) return true;
  return typeFilters.includes(place.type);
}

function matchesBase(
  place: Place,
  req: GenerateRequest,
  excludeSet: Set<string>
): boolean {
  if (excludeSet.has(place.id)) return false;

  if (!matchesType(place, req.type)) return false;

  if (req.setting !== "both" && place.category !== "both") {
    if (place.category !== req.setting) return false;
  }

  return true;
}

function pickFrom(pool: Place[], usedIds: Set<string>): Place | undefined {
  for (const p of pool) {
    if (!usedIds.has(p.id)) {
      usedIds.add(p.id);
      return p;
    }
  }
  return undefined;
}

function pickPlaces(
  activities: Place[],
  foods: Place[],
  usedIds: Set<string>,
  typeFilters: string[]
): Place[] {
  const places: Place[] = [];

  const hasFood = typeFilters.includes("food");
  const hasActivity = typeFilters.some((t) =>
    ["exhibition", "concert", "music", "theater", "movie", "attraction"].includes(t)
  );
  const isAll = typeFilters.includes("all");

  if (hasFood && !hasActivity && !isAll) {
    // Only food types selected: pick 3 food items
    for (let i = 0; i < 3; i++) {
      const f = pickFrom(foods, usedIds);
      if (f) places.push(f);
    }
  } else {
    // Activity types, mixed, or "all": activity → food → activity
    const a1 = pickFrom(activities, usedIds);
    if (a1) places.push(a1);
    const f1 = pickFrom(foods, usedIds);
    if (f1) places.push(f1);
    const a2 = pickFrom(activities, usedIds);
    if (a2) places.push(a2);
    if (places.length < 3) {
      const extra = pickFrom(activities, usedIds) ?? pickFrom(foods, usedIds);
      if (extra) places.push(extra);
    }
  }

  return places;
}

export function generateItineraries(
  req: GenerateRequest,
  count: number = 2
): Itinerary[] {
  const allPlaces = readCombinedPlaces();
  const excludeSet = new Set(req.exclude ?? []);

  // Filter by base criteria (type, setting) — district handled separately
  const baseFiltered = allPlaces.filter((p) => matchesBase(p, req, excludeSet));

  // Determine filter mode from the district param:
  //  - "不限"         → no location filter
  //  - "X-all"        → city-wide（只該縣市）
  //  - "臺北市大安區" → specific district（複合鍵，只該區）
  const district = req.district ?? "不限";
  const isCityWide = district.endsWith("-all"); // e.g. "台北-all", "桃園-all"
  const isSpecific = district !== "不限" && !isCityWide; // e.g. "臺北市大安區"

  // 嚴格地點篩選（plan 14）：排除「確定在其他縣市 / 其他行政區」的資料，
  // 只放行「確定在所選範圍」或「地點判不出」者；不跨區、不跨縣市補資料。
  // 地點判不出者（如無地址的電影）作為補充（tier2，排在精準命中之後）。
  let prioritized: Place[];

  if (!isSpecific && !isCityWide) {
    // 不限 — 全部
    prioritized = shuffle(baseFiltered);
  } else if (isCityWide) {
    // 只選縣市：保留地址確定在該縣市者 + 地點不明者；排除確定在其他縣市者
    const selCity = district.replace("-all", "");
    const kept = baseFiltered.filter((p) => {
      const ac = addressCity(p.address);
      return ac === null || ac === selCity;
    });
    const exact = kept.filter((p) => addressCity(p.address) === selCity);
    const unknown = kept.filter((p) => addressCity(p.address) === null);
    prioritized = [...shuffle(exact), ...shuffle(unknown)];
  } else {
    // 指定行政區（複合鍵）：排除其他縣市與其他行政區；保留該區 + 區不明者
    const selCity =
      Object.keys(CITY_FULL).find((c) => district.startsWith(CITY_FULL[c])) ?? null;
    const kept = baseFiltered.filter((p) => {
      const ac = addressCity(p.address);
      if (ac !== null && ac !== selCity) return false; // 其他縣市
      const dk = placeDistrictKey(p.district);
      if (dk !== null && dk !== district) return false; // 其他行政區（含同縣市他區）
      return true;
    });
    const exact = kept.filter((p) => placeDistrictKey(p.district) === district);
    const backfill = kept.filter((p) => placeDistrictKey(p.district) !== district);
    prioritized = [...shuffle(exact), ...shuffle(backfill)];
  }

  const activities = prioritized.filter(isActivity);
  const foods = prioritized.filter(isFood);

  const itineraries: Itinerary[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < count; i++) {
    const places = pickPlaces(activities, foods, usedIds, req.type);
    if (places.length === 0) break;

    itineraries.push({
      id: randomUUID().slice(0, 8),
      places,
    });
  }

  return itineraries;
}
