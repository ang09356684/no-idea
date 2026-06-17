"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PlaceType } from "@/types";
import { usePocketList } from "@/lib/usePocketList";
import SignInGate from "@/components/SignInGate";

const GMAP_URL_RE =
  /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl|share\.google|(?:www\.|maps\.)?google\.com\/maps)/i;

// 手機 Google Maps 的「分享」按鈕複製出來常是「店名\n\nhttps://share.google/xxx」整段，
// 直接驗證會失敗，所以先從整串裡掃出第一個合法的 gmap URL。
const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCT_RE = /[.,;)\]}'"]+$/;

function extractGmapUrl(text: string): string | null {
  const matches = text.match(URL_RE);
  if (!matches) return null;
  for (const raw of matches) {
    const cleaned = raw.replace(TRAILING_PUNCT_RE, "");
    if (GMAP_URL_RE.test(cleaned)) return cleaned;
  }
  return null;
}

const PARSE_ERROR_MESSAGES: Record<string, string> = {
  "invalid-url": "請貼上 Google Maps 連結",
  "not-google": "請貼上 Google Maps 連結",
  "parse-failed": "無法解析此連結，請手動填寫",
  "fetch-failed": "無法連線 Google Maps，請稍後再試",
  timeout: "連線逾時，請手動填寫",
};

const TYPES: { value: PlaceType; label: string }[] = [
  { value: "exhibition", label: "展覽" },
  { value: "concert", label: "演唱會" },
  { value: "music", label: "音樂會" },
  { value: "theater", label: "戲劇" },
  { value: "movie", label: "電影" },
  { value: "attraction", label: "景點" },
  { value: "food", label: "美食" },
];

const CATEGORIES = [
  { value: "both", label: "都可以" },
  { value: "indoor", label: "室內" },
  { value: "outdoor", label: "室外" },
] as const;

function extractDistrict(address: string): string {
  const match = address.match(
    /(中正區|大安區|信義區|中山區|松山區|大同區|萬華區|士林區|北投區|文山區|南港區|內湖區|桃園區|中壢區|平鎮區|八德區|楊梅區|蘆竹區|龜山區|大園區|觀音區|新屋區|大溪區|龍潭區|復興區|宜蘭市|羅東鎮|蘇澳鎮|頭城鎮|礁溪鄉|壯圍鄉|員山鄉|冬山鄉|五結鄉|三星鄉|大同鄉|南澳鄉)/
  );
  return match ? match[1] : "不限";
}

export default function AddCustomPlacePage() {
  const router = useRouter();
  const { add } = usePocketList();
  const [type, setType] = useState<PlaceType>("food");
  const [category, setCategory] = useState<"indoor" | "outdoor" | "both">(
    "both"
  );
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [gmapUrl, setGmapUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parseNote, setParseNote] = useState("");
  const lastParsedRef = useRef<string>("");

  const canSave = name.trim() && address.trim();
  const canParse = extractGmapUrl(gmapUrl.trim()) !== null;

  const handleParseGmap = async (rawUrl?: string) => {
    if (parsing) return;
    const input = (rawUrl ?? gmapUrl).trim();
    const url = extractGmapUrl(input);
    if (!url) {
      setParseError(PARSE_ERROR_MESSAGES["not-google"]);
      setParseNote("");
      return;
    }
    // 若使用者貼的字串夾雜店名等多餘文字，把欄位 normalize 成純 URL
    if (url !== gmapUrl.trim()) setGmapUrl(url);
    if (url === lastParsedRef.current) return;

    if (
      (name.trim() || address.trim()) &&
      !window.confirm("已有填入的內容，要從 Google Maps 覆寫嗎？")
    ) {
      return;
    }

    setParsing(true);
    setParseError("");
    setParseNote("");
    lastParsedRef.current = url;

    try {
      const res = await fetch("/api/pocket-list/parse-gmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as {
        name?: string;
        address?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        setParseError(
          PARSE_ERROR_MESSAGES[data.error ?? ""] ??
            "無法解析此連結，請手動填寫"
        );
        return;
      }

      if (data.name) setName(data.name);
      if (data.address) setAddress(data.address);

      if (data.name && data.address) {
        setParseNote("已從 Google Maps 帶入，請確認後儲存");
      } else if (data.name) {
        setParseNote("已帶入名稱，地址請手動補上");
      } else if (data.address) {
        setParseNote("已帶入地址，名稱請手動補上");
      } else {
        setParseError("無法解析此連結，請手動填寫");
      }
    } catch {
      setParseError("無法連線，請稍後再試");
    } finally {
      setParsing(false);
    }
  };

  const handleGmapPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    const extracted = extractGmapUrl(pasted);
    if (!extracted) return;
    setGmapUrl(extracted);
    queueMicrotask(() => handleParseGmap(extracted));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");

    try {
      const district = extractDistrict(address.trim());
      await add({
        name: name.trim(),
        type,
        category,
        address: address.trim(),
        district,
        goodFor: "both",
      });
      router.push("/pocket-list");
    } catch {
      setError("儲存失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        <Link
          href="/pocket-list"
          className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
        >
          &larr; 返回口袋名單
        </Link>

        <SignInGate message="登入以新增口袋名單">
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-50">
          新增項目
        </h1>

        {/* Type selector */}
        <div className="mb-6">
          <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
            分類
          </label>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  type === t.value
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category selector */}
        <div className="mb-6">
          <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
            場景
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  category === c.value
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Google Maps link auto-fill */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Google Maps 連結（選填）
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={gmapUrl}
              onChange={(e) => setGmapUrl(e.target.value)}
              onPaste={handleGmapPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleParseGmap();
                }
              }}
              disabled={parsing}
              placeholder="貼上 maps.app.goo.gl/... 或 share.google/... 自動帶入"
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => handleParseGmap()}
              disabled={!canParse || parsing}
              className="shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-4 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              {parsing ? "解析中..." : "自動帶入"}
            </button>
          </div>
          {parseError && (
            <p className="mt-1.5 text-xs text-red-500">{parseError}</p>
          )}
          {!parseError && parseNote && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {parseNote}
            </p>
          )}
        </div>

        {/* Name input */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            名稱
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：鼎泰豐信義店"
            readOnly={parsing}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none read-only:opacity-60"
          />
        </div>

        {/* Address input */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            地址
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="例：台北市信義區信義路二段194號"
            readOnly={parsing}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none read-only:opacity-60"
          />
          {address.trim() && (
            <p className="mt-1.5 text-xs text-gray-400">
              行政區：{extractDistrict(address.trim())}
            </p>
          )}
        </div>

        {/* Preview */}
        {canSave && (
          <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4">
            <p className="mb-1 text-xs font-medium text-gray-400">預覽</p>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-50">
              {name.trim()}
            </p>
            <p className="text-sm text-gray-500">{address.trim()}</p>
            <div className="mt-2 flex gap-2">
              <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {TYPES.find((t) => t.value === type)?.label}
              </span>
              <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {CATEGORIES.find((c) => c.value === category)?.label}
              </span>
              <span className="rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {extractDistrict(address.trim())}
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="mb-4 text-sm text-red-500">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-full py-3 text-lg font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            backgroundColor: "var(--theme-accent)",
            color: "var(--theme-on-accent)",
          }}
        >
          {saving ? "儲存中..." : "儲存"}
        </button>
        </SignInGate>
      </div>
    </main>
  );
}
