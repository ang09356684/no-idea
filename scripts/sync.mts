/**
 * 獨立 sync 腳本（本機 / CI 共用）。
 *
 * 不需起 Next server：直接呼叫各來源 syncXxx() 重抓資料，再用 combineAllPlaces()
 * 重新產生 data/combined/*.json（隨部署出貨的共用 catalog）。
 *
 * 用法：npm run sync
 * 取代原本的 src/app/api/sync/route.ts（已移除），把 SSE 進度改成 CLI 輸出。
 * GitHub Action（.github/workflows/weekly-sync.yml）每週也跑這支。
 */
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

type Source = { name: string; fn: () => Promise<SyncResult> };

// fetch-based，彼此獨立，可並行
const FAST_SOURCES: Source[] = [
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

// 較慢，序列跑：opentix 需抓大量頁面、kktix 用 Playwright（無頭瀏覽器）
const SLOW_SOURCES: Source[] = [
  { name: "opentix", fn: syncOpentix },
  { name: "kktix", fn: syncKktix },
];

const TOTAL = FAST_SOURCES.length + SLOW_SOURCES.length;

// 單一來源失敗不影響其他來源（出錯時各 syncXxx 內部已 try/catch、不覆寫既有 raw）
async function runSource({ name, fn }: Source): Promise<void> {
  const t0 = Date.now();
  try {
    const r = await fn();
    const tag = r.status === "success" ? "✔" : "⚠";
    console.log(`[sync] ${tag} ${name}: ${r.status} — ${r.count} items (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error(`[sync] ✗ ${name}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main(): Promise<void> {
  console.log(`[sync] start: ${TOTAL} sources`);

  // fast 來源並行
  await Promise.all(FAST_SOURCES.map(runSource));

  // slow 來源序列（避免資源衝突）
  for (const src of SLOW_SOURCES) {
    await runSource(src);
  }

  // 彙整去重 → 寫出 data/combined/*.json
  const all = combineAllPlaces();
  console.log(`[sync] done: combined ${all.length} places → data/combined/*.json`);
}

main().catch((e) => {
  console.error("[sync] fatal:", e);
  process.exit(1);
});
