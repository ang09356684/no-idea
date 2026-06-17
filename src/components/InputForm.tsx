"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CITIES as CITY_KEYS,
  CITY_DISTRICTS,
  districtKey,
  districtShortLabel,
} from "@/lib/districts";

const CITIES = [
  { value: "不限", label: "不限" },
  ...CITY_KEYS.map((c) => ({ value: c, label: c })),
] as const;

// 由共用資料動態產生子區選項；value 為「縣市+區」複合鍵（對策 A），
// city-wide「不限」用 `${city}-不限`，送出時轉成 `${city}-all`。
const SUB_DISTRICTS: Record<string, { value: string; label: string }[]> =
  Object.fromEntries(
    CITY_KEYS.map((city) => [
      city,
      [
        { value: `${city}-不限`, label: "不限" },
        ...CITY_DISTRICTS[city].map((d) => ({
          value: districtKey(city, d),
          label: districtShortLabel(d),
        })),
      ],
    ])
  );

const TYPES = [
  { value: "all", label: "不限" },
  { value: "exhibition", label: "展覽" },
  { value: "concert", label: "演唱會" },
  { value: "music", label: "音樂會" },
  { value: "theater", label: "戲劇" },
  { value: "movie", label: "電影" },
  { value: "attraction", label: "景點" },
  { value: "food", label: "美食" },
] as const;

const SETTINGS = [
  { value: "both", label: "都可以" },
  { value: "indoor", label: "室內" },
  { value: "outdoor", label: "室外" },
] as const;

interface ChipGroupProps {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}

function ChipGroup({ label, options, selected, onSelect }: ChipGroupProps) {
  return (
    <div className="mb-6">
      <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              style={
                isActive
                  ? {
                      background: "var(--theme-accent)",
                      color: "var(--theme-on-accent)",
                    }
                  : undefined
              }
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MultiChipGroupProps {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  maxSelect: number;
  allValue: string;
  onSelect: (values: string[]) => void;
}

function MultiChipGroup({ label, options, selected, maxSelect, allValue, onSelect }: MultiChipGroupProps) {
  const isFull = selected.length >= maxSelect && !selected.includes(allValue);

  const handleClick = (value: string) => {
    if (value === allValue) {
      onSelect([allValue]);
      return;
    }

    if (selected.includes(allValue)) {
      onSelect([value]);
      return;
    }

    if (selected.includes(value)) {
      const next = selected.filter((v) => v !== value);
      onSelect(next.length === 0 ? [allValue] : next);
      return;
    }

    if (selected.length < maxSelect) {
      onSelect([...selected, value]);
    }
  };

  return (
    <div className="mb-6">
      <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = selected.includes(opt.value);
          const isDisabled = isFull && !isActive && opt.value !== allValue;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleClick(opt.value)}
              style={
                isActive
                  ? {
                      background: "var(--theme-accent)",
                      color: "var(--theme-on-accent)",
                    }
                  : undefined
              }
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : isDisabled
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-40 dark:bg-gray-800 dark:text-gray-500"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function InputForm() {
  const router = useRouter();
  const [city, setCity] = useState("不限");
  const [subDistrict, setSubDistrict] = useState("");
  const [types, setTypes] = useState<string[]>(["all"]);
  const [setting, setSetting] = useState("both");

  const handleCitySelect = (value: string) => {
    setCity(value);
    setSubDistrict("");
  };

  const handleSubmit = () => {
    // Determine the district value to send
    let district = "不限";
    if (city === "不限") {
      district = "不限";
    } else if (!subDistrict || subDistrict.endsWith("-不限")) {
      // City selected but no sub-district → send city name for city-wide match
      district = `${city}-all`;
    } else {
      district = subDistrict;
    }

    const params = new URLSearchParams({ district, type: types.join(","), setting });
    router.push(`/result?${params.toString()}`);
  };

  const subOptions = SUB_DISTRICTS[city];

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* City selector */}
      <ChipGroup
        label="地點"
        options={CITIES}
        selected={city}
        onSelect={handleCitySelect}
      />

      {/* Sub-district selector (expandable) */}
      {subOptions && (
        <div className="mb-6 -mt-3 ml-2 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
          <label className="mb-2 block text-xs font-medium text-gray-400">
            區域
          </label>
          <div className="flex flex-wrap gap-2">
            {subOptions.map((opt) => {
              const isActive = subDistrict === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSubDistrict(opt.value)}
                  style={
                    isActive
                      ? {
                          background: "var(--theme-heart)",
                          color: "var(--theme-on-accent)",
                        }
                      : undefined
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <MultiChipGroup
        label="類型（最多 3 個）"
        options={TYPES}
        selected={types}
        maxSelect={3}
        allValue="all"
        onSelect={setTypes}
      />
      <ChipGroup
        label="場景"
        options={SETTINGS}
        selected={setting}
        onSelect={setSetting}
      />
      <button
        onClick={handleSubmit}
        style={{
          background: "var(--theme-accent)",
          color: "var(--theme-on-accent)",
        }}
        className="mt-4 w-full rounded-full bg-gray-900 py-3 text-lg font-semibold text-white transition-colors hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        幫我安排！
      </button>
    </div>
  );
}
