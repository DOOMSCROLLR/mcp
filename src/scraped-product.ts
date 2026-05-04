/**
 * Shared types + utilities for public storefront product scrapers.
 * Compatible with the Shopify scraper's normalized shape (see src/shopify.ts).
 */

import type { ShopifyScrapedProduct, ShopifyScrapedVariant } from "./shopify.js";

export type Platform = "shopify" | "gumroad" | "payhip" | "bandcamp" | "bigcartel";

export type ScrapedVariant = ShopifyScrapedVariant;

export interface ScrapedProduct extends Omit<ShopifyScrapedProduct, "tags"> {
  tags?: string[];
  is_virtual?: boolean;
  platform?: Platform;
  currency?: string;
}

export type ScrapeResult = {
  source_url: string;
  feed_url?: string;
  store_url?: string;
  count: number;
  products: ScrapedProduct[];
  platform: Platform;
};

export const USER_AGENT = "Mozilla/5.0 (compatible; DOOMSCROLLR product scraper; +https://doomscrollr.com)";

export function parseHttpUrl(input: string): URL {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL must start with http:// or https://");
  }
  return url;
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json,text/plain,*/*", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function absoluteUrl(value: string, base: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

export function cleanDescription(raw: unknown): string | undefined {
  const value = stringValue(raw);
  if (!value) return undefined;
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000) || undefined;
}

export function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Extract all <script type="application/ld+json"> blocks parsed as JSON.
 * Returns a flat array (handles @graph arrays too).
 */
export function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && Array.isArray(item["@graph"])) {
          out.push(...item["@graph"]);
        } else {
          out.push(item);
        }
      }
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function findProductLd(jsonLd: any[]): any | null {
  for (const node of jsonLd) {
    if (!node || typeof node !== "object") continue;
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && /product/i.test(t))) {
      return node;
    }
  }
  return null;
}

export function priceFromOffers(offers: any): { min?: number; max?: number; price?: number; currency?: string } {
  if (!offers) return {};
  const list: any[] = Array.isArray(offers) ? offers : offers["@type"] === "AggregateOffer" ? [offers] : [offers];
  let min: number | undefined;
  let max: number | undefined;
  let currency: string | undefined;
  let price: number | undefined;

  for (const off of list) {
    if (!off || typeof off !== "object") continue;
    if (!currency) currency = stringValue(off.priceCurrency) || undefined;
    if (off["@type"] === "AggregateOffer") {
      const lo = numberValue(off.lowPrice);
      const hi = numberValue(off.highPrice);
      const single = numberValue(off.price);
      if (lo !== undefined) min = min === undefined ? lo : Math.min(min, lo);
      if (hi !== undefined) max = max === undefined ? hi : Math.max(max, hi);
      if (single !== undefined) {
        price = price ?? single;
        min = min === undefined ? single : Math.min(min, single);
        max = max === undefined ? single : Math.max(max, single);
      }
    } else {
      const p = numberValue(off.price);
      if (p !== undefined) {
        price = price ?? p;
        min = min === undefined ? p : Math.min(min, p);
        max = max === undefined ? p : Math.max(max, p);
      }
    }
  }
  return { min, max, price, currency };
}

export function imagesFromLd(raw: any): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const urls: string[] = [];
  for (const item of list) {
    if (typeof item === "string") urls.push(item);
    else if (item && typeof item === "object") {
      const url = stringValue(item.url || item.contentUrl || item["@id"]);
      if (url) urls.push(url);
    }
  }
  return dedupe(urls.filter((u) => /^https?:\/\//i.test(u)));
}
