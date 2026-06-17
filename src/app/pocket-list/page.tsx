"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { Place } from "@/types";
import { usePocketList } from "@/lib/usePocketList";
import SignInGate from "@/components/SignInGate";

const TYPE_LABELS: Record<string, string> = {
  exhibition: "展覽",
  concert: "演唱會",
  music: "音樂會",
  theater: "戲劇",
  movie: "電影",
  food: "美食",
  attraction: "景點",
};

const TYPE_COLORS: Record<string, string> = {
  exhibition: "bg-purple-100 text-purple-700",
  concert: "bg-rose-100 text-rose-700",
  music: "bg-indigo-100 text-indigo-700",
  theater: "bg-fuchsia-100 text-fuchsia-700",
  movie: "bg-blue-100 text-blue-700",
  food: "bg-orange-100 text-orange-700",
  attraction: "bg-green-100 text-green-700",
};

export default function CustomPlacesPage() {
  const { places, loading, remove, replaceAll } = usePocketList();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(places, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `noidea-pocket-list-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        alert("檔案不是合法的 JSON");
        return;
      }
      if (!Array.isArray(parsed)) {
        alert("檔案內容必須是陣列");
        return;
      }
      const confirmed = window.confirm(
        `將覆蓋現有 ${places.length} 筆口袋名單，確定匯入 ${parsed.length} 筆？`
      );
      if (!confirmed) return;

      await replaceAll(parsed as Place[]);
    } catch {
      alert("匯入失敗，請稍後再試");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await remove(id);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
        >
          &larr; 返回首頁
        </Link>

        <SignInGate message="登入以使用口袋名單">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                口袋名單
              </h1>
              <p className="text-sm text-gray-400">共 {places.length} 筆</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={places.length === 0}
                className="rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{
                  borderColor: "var(--theme-pin)",
                  color: "var(--theme-pin)",
                }}
              >
                匯出
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{
                  borderColor: "var(--theme-pin)",
                  color: "var(--theme-pin)",
                }}
              >
                {importing ? "匯入中..." : "匯入"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportFile}
                className="hidden"
              />
              <Link
                href="/pocket-list/add"
                className="rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: "var(--theme-pin)",
                  color: "var(--theme-on-accent)",
                }}
              >
                ＋ 新增項目
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          ) : places.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-4xl mb-4">📍</p>
              <p className="text-lg">還沒有口袋名單</p>
              <p className="mt-2 text-sm">
                新增你喜歡的美食、景點，讓行程更個人化
              </p>
              <Link
                href="/pocket-list/add"
                className="mt-4 inline-block rounded-full px-6 py-2"
                style={{
                  backgroundColor: "var(--theme-pin)",
                  color: "var(--theme-on-accent)",
                }}
              >
                新增第一個項目
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {places.map((place) => (
                <div
                  key={place.id}
                  className="flex items-start gap-4 rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm border border-gray-100 dark:border-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          TYPE_COLORS[place.type] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {TYPE_LABELS[place.type] ?? place.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        {place.district}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 truncate">
                      {place.name}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">
                      {place.address}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(place.id)}
                    disabled={deleting === place.id}
                    className="shrink-0 rounded-full p-2 text-sm text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 disabled:opacity-40"
                    aria-label="刪除"
                  >
                    {deleting === place.id ? "..." : "✕"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </SignInGate>
      </div>
    </main>
  );
}
