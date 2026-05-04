/**
 * Payhip public storefront scraper.
 *
 *  - Storefront: https://payhip.com/username
 *  - Product:    https://payhip.com/b/<slug>
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
  parseHttpUrl,
  priceFromOffers,
  stringValue,
} from "./scraped-product.js";
import { extractMetaTag, extractTitleTag } from "./gumroad.js";

type Options = { limit?: number };

export async function scrapePayhipProducts(sourceUrl: string, options: Options = {}): Promise<ScrapeResult> {
  const url = parseHttpUrl(sourceUrl);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250);

  if (/^\/b\/[^/]+/i.test(url.pathname)) {
    const product = await scrapePayhipProductPage(url.toString());
    return {
      source_url: sourceUrl,
      store_url: `${url.protocol}//${url.host}`,
      count: product ? 1 : 0,
      products: product ? [product] : [],
      platform: "payhip",
    };
  }

  const html = await fetchHtml(url.toString());
  const productUrls = findPayhipProductLinks(html, url).slice(0, limit);

  const products: ScrapedProduct[] = [];
  for (const purl of productUrls) {
    try {
      const p = await scrapePayhipProductPage(purl);
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
    platform: "payhip",
  };
}

export function findPayhipProductLinks(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  const re = /href=["']([^"']*\/b\/[^"'?#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl);
      if (!/payhip\.com$/i.test(u.host)) continue;
      const clean = `${u.protocol}//${u.host}${u.pathname}`;
      if (!urls.includes(clean) && /^\/b\/[^/]+/.test(u.pathname)) urls.push(clean);
    } catch {
      /* skip */
    }
  }
  return urls;
}

export async function scrapePayhipProductPage(productUrl: string): Promise<ScrapedProduct | null> {
  const html = await fetchHtml(productUrl);
  return parsePayhipProductHtml(html, productUrl);
}

export function parsePayhipProductHtml(html: string, productUrl: string): ScrapedProduct | null {
  const jsonLd = extractJsonLd(html);
  const node = findProductLd(jsonLd);

  const title = stringValue(node?.name) || extractMetaTag(html, "og:title") || extractTitleTag(html);
  if (!title) return null;

  const description = cleanDescription(node?.description || extractMetaTag(html, "og:description"));
  const images = dedupe([...imagesFromLd(node?.image), extractMetaTag(html, "og:image")].filter((u): u is string => !!u && /^https?:\/\//i.test(u)));
  const offers = priceFromOffers(node?.offers);
  const price = offers.price ?? offers.min ?? 0;

  return {
    title,
    description,
    url: productUrl,
    image: images[0],
    images,
    price,
    price_min: offers.min ?? price,
    price_max: offers.max ?? price,
    variant_options: [],
    variants: [],
    is_virtual: true,
    platform: "payhip",
    currency: offers.currency,
  };
}
