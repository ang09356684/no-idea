import { syncCulture, syncCultureMusic, syncCultureTheater } from "@/lib/sync/culture";
import { syncHuashan } from "@/lib/sync/huashan";
import { syncSongshan } from "@/lib/sync/songshan";
import { syncTwtc } from "@/lib/sync/twtc";
import { syncNtsec } from "@/lib/sync/ntsec";
import { syncAtmovies } from "@/lib/sync/atmovies";
import { syncTaipeiAttractions } from "@/lib/sync/taipei-attractions";
import { syncTaoyuan } from "@/lib/sync/taoyuan";
import { syncTixcraft } from "@/lib/sync/tixcraft";
import { syncEraTicket } from "@/lib/sync/era-ticket";
import { syncKham } from "@/lib/sync/kham";
import { syncMna } from "@/lib/sync/mna";
import { syncOpentix } from "@/lib/sync/opentix";
import { syncKktix } from "@/lib/sync/kktix";
import { combineAllPlaces } from "@/lib/combine";
import type { SyncResult } from "@/types";

const SOURCE_LABELS: Record<string, string> = {
  culture: "文化部展覽",
  "culture-music": "文化部音樂",
  "culture-theater": "文化部戲劇",
  huashan: "華山1914",
  songshan: "松山文創",
  twtc: "台北世貿",
  ntsec: "科教館",
  atmovies: "開眼電影",
  "taipei-attraction": "台北景點",
  taoyuan: "桃園景點",
  tixcraft: "拓元售票",
  "era-ticket": "年代售票",
  kham: "寬宏售票",
  mna: "MNA年代",
  opentix: "兩廳院",
  kktix: "KKTIX",
};

// Fast sources (fetch-based, safe to run in parallel)
const FAST_SOURCES: { name: string; fn: () => Promise<SyncResult> }[] = [
  { name: "culture", fn: syncCulture },
  { name: "culture-music", fn: syncCultureMusic },
  { name: "culture-theater", fn: syncCultureTheater },
  { name: "huashan", fn: syncHuashan },
  { name: "songshan", fn: syncSongshan },
  { name: "twtc", fn: syncTwtc },
  { name: "ntsec", fn: syncNtsec },
  { name: "atmovies", fn: syncAtmovies },
  { name: "taipei-attraction", fn: syncTaipeiAttractions },
  { name: "taoyuan", fn: syncTaoyuan },
  { name: "tixcraft", fn: syncTixcraft },
  { name: "era-ticket", fn: syncEraTicket },
  { name: "kham", fn: syncKham },
  { name: "mna", fn: syncMna },
];

// Slow sources (Playwright-based, run sequentially to avoid resource conflicts)
const SLOW_SOURCES: { name: string; fn: () => Promise<SyncResult> }[] = [
  { name: "opentix", fn: syncOpentix },
  { name: "kktix", fn: syncKktix },
];

const TOTAL = FAST_SOURCES.length + SLOW_SOURCES.length;

export async function POST() {
  const encoder = new TextEncoder();
  let progress = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Run fast sources in parallel, emit progress as each completes
      const fastPromises = FAST_SOURCES.map(async ({ name, fn }) => {
        const t0 = Date.now();
        console.log(`[sync] ▶ ${name} started`);
        const result = await fn();
        console.log(`[sync] ✔ ${name} ${result.status} (${result.count} items, ${Date.now() - t0}ms)`);
        progress++;
        send({
          source: name,
          label: SOURCE_LABELS[name] ?? name,
          status: result.status,
          count: result.count,
          progress,
          total: TOTAL,
        });
        return result;
      });

      await Promise.all(fastPromises);

      // Run slow sources sequentially
      for (const { name, fn } of SLOW_SOURCES) {
        const t0 = Date.now();
        console.log(`[sync] ▶ ${name} started`);
        send({
          source: name,
          label: SOURCE_LABELS[name] ?? name,
          status: "syncing",
          progress,
          total: TOTAL,
        });
        const result = await fn();
        console.log(`[sync] ✔ ${name} ${result.status} (${result.count} items, ${Date.now() - t0}ms)`);
        progress++;
        send({
          source: name,
          label: SOURCE_LABELS[name] ?? name,
          status: result.status,
          count: result.count,
          progress,
          total: TOTAL,
        });
      }

      // Combine all data and send final event
      const allPlaces = combineAllPlaces();
      send({ done: true, totalPlaces: allPlaces.length, progress: TOTAL, total: TOTAL });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
