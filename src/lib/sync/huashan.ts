import { writeRawJson, readRawJson } from "@/lib/data";
import type { Place, SyncResult } from "@/types";

const URL = "https://www.huashan1914.com/w/huashan1914/exhibition";

interface HuashanRaw {
  title: string;
  dateRange: string;
  startDate?: string;
  endDate?: string;
  link: string;
  imageUrl?: string;
}

function parseDateRange(range: string): { start?: string; end?: string } {
  // "2025.12.26 - 2026.04.06"
  const parts = range.split("-").map((s) => s.trim().replaceAll(".", "-"));
  return { start: parts[0], end: parts[1] };
}

export async function syncHuashan(): Promise<SyncResult> {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items: HuashanRaw[] = [];
    // Parse exhibition cards from HTML
    // Pattern: title in heading tags, date ranges, links
    const dateRegex = /(\d{4}\.\d{2}\.\d{2}\s*-\s*\d{4}\.\d{2}\.\d{2})/;
    const imgRegex = /<img[^>]*src="([^"]*)"[^>]*>/i;
    let match;

    // Fallback: extract all links to exhibition detail pages
    const linkRegex =
      /href="(\/w\/huashan1914\/exhibition_[^"]*)"/gi;
    const links = new Set<string>();
    while ((match = linkRegex.exec(html)) !== null) {
      links.add(match[1]);
    }

    // Extract titles - look for text near exhibition links
    const sectionRegex =
      /<li[^>]*>[\s\S]*?<a[^>]*href="(\/w\/huashan1914\/exhibition_[^"]*)"[^>]*>[\s\S]*?<\/li>/gi;
    while ((match = sectionRegex.exec(html)) !== null) {
      const section = match[0];
      const link = match[1];
      const titleMatch = section.match(
        /<(?:p|h\d|div|span)[^>]*>((?:(?!<(?:p|h\d|div|span)).)*?(?:展|店|演|藝|節|祭|花|秀|光|影|畫|館|院|集)[\s\S]*?)<\/(?:p|h\d|div|span)>/
      );
      const dateMatch = section.match(dateRegex);
      const imgMatch = section.match(imgRegex);

      // Get clean text from section for title
      const cleanText = section.replace(/<[^>]*>/g, "").trim();
      const lines = cleanText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 2 && l.length < 100);

      const title = titleMatch?.[1]?.trim() || lines[0] || "";
      if (!title) continue;

      const dates = dateMatch ? parseDateRange(dateMatch[1]) : {};
      items.push({
        title: title.replace(/<[^>]*>/g, "").trim(),
        dateRange: dateMatch?.[1] ?? "",
        startDate: dates.start,
        endDate: dates.end,
        link: `https://www.huashan1914.com${link}`,
        imageUrl: imgMatch
          ? imgMatch[1].startsWith("http")
            ? imgMatch[1]
            : `https://www.huashan1914.com${imgMatch[1]}`
          : undefined,
      });
    }

    writeRawJson("exhibitions-huashan.json", items);

    return { source: "huashan", status: "success", count: items.length };
  } catch (e) {
    return {
      source: "huashan",
      status: "error",
      count: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function huashanPlaces(): Place[] {
  const raw: HuashanRaw[] = readRawJson("exhibitions-huashan.json");
  return raw.map((item, i) => ({
    id: `huashan-${i}`,
    name: item.title,
    type: "exhibition" as const,
    source: "huashan",
    category: "indoor" as const,
    address: "臺北市中正區八德路一段1號",
    district: "中正區",
    imageUrl: item.imageUrl,
    sourceUrl: item.link,
    startDate: item.startDate,
    endDate: item.endDate,
    goodFor: "both" as const,
  }));
}
