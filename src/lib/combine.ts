import { writeCombinedJson } from "@/lib/data";
import { culturePlaces, cultureMusicPlaces, cultureTheaterPlaces } from "@/lib/sync/culture";
import { huashanPlaces } from "@/lib/sync/huashan";
import { songshanPlaces } from "@/lib/sync/songshan";
import { twtcPlaces } from "@/lib/sync/twtc";
import { ntsecPlaces } from "@/lib/sync/ntsec";
import { atmoviesPlaces } from "@/lib/sync/atmovies";
import { taipeiAttractionPlaces } from "@/lib/sync/taipei-attractions";
import { taoyuanPlaces } from "@/lib/sync/taoyuan";
import { tixcraftPlaces } from "@/lib/sync/tixcraft";
import { eraTicketPlaces } from "@/lib/sync/era-ticket";
import { khamPlaces } from "@/lib/sync/kham";
import { mnaPlaces } from "@/lib/sync/mna";
import { opentixPlaces } from "@/lib/sync/opentix";
import { kktixPlaces } from "@/lib/sync/kktix";
import { readRawJson } from "@/lib/data";
import { normalizeDistrict } from "@/lib/districts";
import type { Place } from "@/types";

/**
 * Normalize a name for dedup comparison:
 * - lowercase
 * - remove whitespace, punctuation, special chars
 * - normalize Chinese brackets
 */
function normalizeForDedup(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "") // remove all whitespace
    .replace(/[《》「」【】〈〉（）()[\]：:，,。.、／/\-—～~！!？?]/g, "") // remove punctuation
    .replace(/&amp;/g, "");
}

export function combineAllPlaces(): Place[] {
  const exhibitions = [
    ...culturePlaces(),
    ...huashanPlaces(),
    ...songshanPlaces(),
    ...twtcPlaces(),
    ...ntsecPlaces(),
  ];

  const performances = [
    ...cultureMusicPlaces(),
    ...cultureTheaterPlaces(),
    ...tixcraftPlaces(),
    ...eraTicketPlaces(),
    ...khamPlaces(),
    ...mnaPlaces(),
    ...opentixPlaces(),
    ...kktixPlaces(),
  ];

  const movies = atmoviesPlaces();

  const attractions = [
    ...taipeiAttractionPlaces(),
    ...taoyuanPlaces(),
  ];

  // 餐廳/美食資料只來自使用者自己加入的口袋名單，不從 sync 來源帶入
  const customPlaces = readRawJson<Place[]>("pocket-list.json");

  const all = [
    ...exhibitions,
    ...performances,
    ...movies,
    ...attractions,
    ...customPlaces,
  ].map((p) => ({
    // 跨縣市同名行政區對策 A：統一在此把各來源的 district 正規化成「縣市+區」複合鍵
    ...p,
    district: normalizeDistrict(p.address, p.district),
  }));

  // Deduplicate by normalized name
  const seen = new Set<string>();
  const deduped = all.filter((p) => {
    const key = normalizeForDedup(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Write separate combined files
  writeCombinedJson(
    "exhibitions.json",
    deduped.filter((p) => p.type === "exhibition")
  );
  writeCombinedJson(
    "concerts.json",
    deduped.filter((p) => p.type === "concert")
  );
  writeCombinedJson(
    "music.json",
    deduped.filter((p) => p.type === "music")
  );
  writeCombinedJson(
    "theater.json",
    deduped.filter((p) => p.type === "theater")
  );
  writeCombinedJson(
    "movies.json",
    deduped.filter((p) => p.type === "movie")
  );
  writeCombinedJson(
    "restaurants.json",
    deduped.filter(
      (p) =>
        p.type === "food"
    )
  );
  writeCombinedJson(
    "attractions.json",
    deduped.filter((p) => p.type === "attraction")
  );
  writeCombinedJson("all-places.json", deduped);

  return deduped;
}
