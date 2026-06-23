"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PlaceItem from "./PlaceItem";
import { useFavorites } from "@/lib/favorites";
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
  const [items, setItems] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("all");
  const { isFavorite, toggle } = useFavorites();

  useEffect(() => {
    fetch(`/api/list?type=${apiType}`)
      .then((r) => r.json())
      .then((data) => setItems(data.places))
      .finally(() => setLoading(false));
  }, [apiType]);

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
                {s === "all" ? "全部" : sourceLabels[s] ?? s}
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
