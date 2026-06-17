import { readCombinedPlaces } from "@/lib/data";
import { CITY_KEYWORDS } from "@/lib/districts";
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

  // Determine filter mode
  const district = req.district ?? "不限";
  const isCityWide = district.endsWith("-all"); // e.g. "台北-all", "桃園-all"
  const isSpecific = district !== "不限" && !isCityWide; // e.g. "大安區"

  const cityName = isCityWide ? district.replace("-all", "") : "";

  function matchesCity(place: Place, city: string): boolean {
    const keywords = CITY_KEYWORDS[city] ?? [city];
    return keywords.some((kw) => place.address.includes(kw));
  }

  // Split into 3 tiers by location priority
  let exactMatch: Place[];
  let agnostic: Place[];
  let otherDistrict: Place[];

  if (!isSpecific && !isCityWide) {
    // "不限" — no filter
    exactMatch = baseFiltered;
    agnostic = [];
    otherDistrict = [];
  } else if (isCityWide) {
    // City-wide: e.g. "台北-all" → prioritize all places in that city
    exactMatch = baseFiltered.filter((p) => matchesCity(p, cityName));
    agnostic = baseFiltered.filter((p) => p.district === "不限");
    otherDistrict = baseFiltered.filter(
      (p) => !matchesCity(p, cityName) && p.district !== "不限"
    );
  } else {
    // Specific district: e.g. "大安區"
    exactMatch = baseFiltered.filter((p) => p.district === district);
    agnostic = baseFiltered.filter((p) => p.district === "不限");
    otherDistrict = baseFiltered.filter(
      (p) => p.district !== district && p.district !== "不限"
    );
  }

  // Priority order: exact match > agnostic > other district
  const prioritized = [
    ...shuffle(exactMatch),
    ...shuffle(agnostic),
    ...shuffle(otherDistrict),
  ];

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
