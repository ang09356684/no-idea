"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import PlaceItem, { SOURCE_LABELS } from "./PlaceItem";
import { useFavorites } from "@/lib/favorites";
import { usePocketList } from "@/lib/usePocketList";
import { normalizeForDedup } from "@/lib/dedup";
import type { Place } from "@/types";

interface BrowseListProps {
  title: string;
  apiType: string;
  icon: string;
  iconBg: string;
  sourceLabels?: Record<string, string>;
  countLabel?: string;
}

export default function BrowseList({
  title,
  apiType,
  icon,
  iconBg,
  sourceLabels = {},
  countLabel = "筆",
}: BrowseListProps) {
  const [catalog, setCatalog] = useState<Place[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("all");
  const { isFavorite, toggle } = useFavorites();
  const { places: pocketPlaces, loading: pocketLoading } = usePocketList();

  useEffect(() => {
    fetch(`/api/list?type=${apiType}`)
      .then((r) => r.json())
      .then((data) => setCatalog(data.places ?? []))
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, [apiType]);

  // 共用 catalog（/api/list，server 端的爬蟲資料）＋ 使用者自己的口袋名單（Firestore /
  // localStorage，只有 client 讀得到）。口袋項目依 type 落到對應分類頁，排在最前面。
  // 去重規則與產生行程的 mergeWithPocket() 一致：同名以 catalog 為準，避免一筆顯示兩次。
  const items = useMemo(() => {
    const seen = new Set(catalog.map((p) => normalizeForDedup(p.name)));
    const mine = pocketPlaces.filter((p) => {
      if (p.type !== apiType) return false;
      const key = normalizeForDedup(p.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...mine, ...catalog];
  }, [catalog, pocketPlaces, apiType]);

  // catalog 是空的（例如美食目前沒有共用來源）才等口袋名單，免得先閃一次「共 0 筆」。
  // catalog 有東西就直接渲染 —— Firestore 慢或連不上時不該讓整頁卡在 skeleton。
  const loading = catalogLoading || (pocketLoading && catalog.length === 0);

  // 個別分類頁的 sourceLabels 可覆寫共用標籤
  const labels = { ...SOURCE_LABELS, ...sourceLabels };
  const sources = [
    "all",
    ...Array.from(new Set(items.map((e) => e.source))),
  ];
  const showSourceFilter = sources.length > 2;

  const filtered =
    sourceFilter === "all"
      ? items
      : items.filter((e) => e.source === sourceFilter);

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
        >
          &larr; 返回首頁
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-50">
          {title}
        </h1>
        <p className="mb-4 text-sm text-gray-400">
          共 {filtered.length} {countLabel}
        </p>

        {showSourceFilter && (
          <div className="mb-6 flex flex-wrap gap-2">
            {sources.map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  sourceFilter === s
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {s === "all" ? "全部" : labels[s] ?? s}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div
                  className={`mt-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${iconBg}`}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <PlaceItem
                    place={item}
                    sourceLabel={labels[item.source]}
                    isFavorite={isFavorite(item.id)}
                    onToggleFavorite={toggle}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
