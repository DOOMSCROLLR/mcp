/**
 * Bandcamp public catalog scraper.
 *
 *  - Artist root:  https://artist.bandcamp.com
 *  - Music page:   https://artist.bandcamp.com/music
 *  - Album page:   https://artist.bandcamp.com/album/slug
 *  - Track page:   https://artist.bandcamp.com/track/slug
 *  - Merch page:   https://artist.bandcamp.com/merch
 */

import {
  type ScrapeResult,
  type ScrapedProduct,
  cleanDescription,
  dedupe,
  extractJsonLd,
  fetchHtml,
  findProductLd,
  imagesFromLd,
  numberValue,
  parseHttpUrl,
  priceFromOffers,
  stringValue,
} from "./scraped-product.js";
import { extractMetaTag, extractTitleTag } from "./gumroad.js";

type Options = { limit?: number };

export async function scrapeBandcampProducts(sourceUrl: string, options: Options = {}): Promise<ScrapeResult> {
  const url = parseHttpUrl(sourceUrl);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250);

  const isItemPage = /^\/(album|track)\//i.test(url.pathname);
  if (isItemPage) {
    const product = await scrapeBandcampItemPage(url.toString());
    return {
      source_url: sourceUrl,
      store_url: `${url.protocol}//${url.host}`,
      count: product ? 1 : 0,
      products: product ? [product] : [],
      platform: "bandcamp",
    };
  }

  // Artist/music page → discover items
  const musicUrl = url.pathname === "/" || url.pathname === ""
    ? new URL("/music", url).toString()
    : url.toString();
  let html: string;
  try {
    html = await fetchHtml(musicUrl);
  } catch {
    html = await fetchHtml(url.toString());
  }
  const itemUrls = findBandcampItemLinks(html, url).slice(0, limit);

  const products: ScrapedProduct[] = [];
  for (const itemUrl of itemUrls) {
    try {
      const p = await scrapeBandcampItemPage(itemUrl);
      if (p) products.push(p);
    } catch {
      /* skip */
    }
  }

  return {
    source_url: sourceUrl,
    store_url: `${url.protocol}//${url.host}`,
    count: products.length,
    products,
    platform: "bandcamp",
  };
}

export function findBandcampItemLinks(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  const re = /href=["']([^"']*\/(?:album|track)\/[^"'?#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl);
      if (!/bandcamp\.com$/i.test(u.host) && !/\.bandcamp\.com$/i.test(u.host)) continue;
      const clean = `${u.protocol}//${u.host}${u.pathname}`;
      if (!urls.includes(clean)) urls.push(clean);
    } catch {
      /* skip */
    }
  }
  return urls;
}

export async function scrapeBandcampItemPage(itemUrl: string): Promise<ScrapedProduct | null> {
  const html = await fetchHtml(itemUrl);
  return parseBandcampItemHtml(html, itemUrl);
}

export function parseBandcampItemHtml(html: string, itemUrl: string): ScrapedProduct | null {
  const tralbum = extractTralbumData(html);
  const jsonLd = extractJsonLd(html);
  const node = findProductLd(jsonLd) || jsonLd.find((n) => n && /MusicAlbum|MusicRecording/i.test(stringValue(n["@type"])));

  const title = stringValue(tralbum?.current?.title || node?.name) || extractMetaTag(html, "og:title") || extractTitleTag(html);
  if (!title) return null;

  const description = cleanDescription(tralbum?.current?.about || node?.description || extractMetaTag(html, "og:description"));
  const images = dedupe([...imagesFromLd(node?.image), extractMetaTag(html, "og:image")].filter((u): u is string => !!u && /^https?:\/\//i.test(u)));

  const offers = priceFromOffers(node?.offers);
  let price = numberValue(tralbum?.current?.minimum_price);
  if (price === undefined) price = offers.price ?? offers.min ?? 0;

  // Detect physical merch by tralbum.packages presence (album CDs, vinyl, etc.)
  const hasPackages = Array.isArray(tralbum?.packages) && tralbum.packages.length > 0;
  const isVirtual = !hasPackages;

  return {
    title,
    description,
    url: itemUrl,
    image: images[0],
    images,
    price,
    price_min: offers.min ?? price,
    price_max: offers.max ?? price,
    variant_options: [],
    variants: [],
    is_virtual: isVirtual,
    platform: "bandcamp",
    currency: offers.currency || stringValue(tralbum?.current?.currency) || undefined,
  };
}

function extractTralbumData(html: string): any | null {
  // Bandcamp uses data-tralbum="..." with &quot;-encoded JSON, or data-tralbum='...' with raw JSON.
  const candidates: string[] = [];
  const dq = /data-tralbum="([^"]*)"/.exec(html);
  if (dq) candidates.push(dq[1]);
  const sq = /data-tralbum='([^']*)'/.exec(html);
  if (sq) candidates.push(sq[1]);
  for (const raw of candidates) {
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    try {
      return JSON.parse(decoded);
    } catch {
      /* try next */
    }
  }
  return null;
}
