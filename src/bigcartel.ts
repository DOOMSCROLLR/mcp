/**
 * Big Cartel public storefront scraper.
 *
 * Big Cartel exposes /products.json on most stores. Falls back to HTML+JSON-LD.
 *
 *  - Storefront:  https://store.bigcartel.com
 *  - Product:     https://store.bigcartel.com/product/slug
 */

import {
  type ScrapeResult,
  type ScrapedProduct,
  type ScrapedVariant,
  USER_AGENT,
  cleanDescription,
  dedupe,
  extractJsonLd,
  fetchHtml,
  fetchJson,
  findProductLd,
  imagesFromLd,
  numberValue,
  parseHttpUrl,
  priceFromOffers,
  stringValue,
} from "./scraped-product.js";
import { extractMetaTag, extractTitleTag } from "./gumroad.js";

type Options = { limit?: number };

export async function scrapeBigCartelProducts(sourceUrl: string, options: Options = {}): Promise<ScrapeResult> {
  const url = parseHttpUrl(sourceUrl);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250);
  const base = `${url.protocol}//${url.host}`;

  if (/^\/product\//i.test(url.pathname)) {
    const product = await scrapeBigCartelProductPage(url.toString());
    return {
      source_url: sourceUrl,
      store_url: base,
      count: product ? 1 : 0,
      products: product ? [product] : [],
      platform: "bigcartel",
    };
  }

  // Try /products.json first
  try {
    const feedUrl = `${base}/products.json`;
    const json = await fetchJson<any>(feedUrl);
    const list: any[] = Array.isArray(json) ? json : Array.isArray(json?.products) ? json.products : [];
    const products = list
      .map((p) => normalizeBigCartelFeedProduct(p, base))
      .filter((p): p is ScrapedProduct => !!p)
      .slice(0, limit);
    if (products.length > 0) {
      return {
        source_url: sourceUrl,
        feed_url: feedUrl,
        store_url: base,
        count: products.length,
        products,
        platform: "bigcartel",
      };
    }
  } catch {
    /* fall through to HTML scrape */
  }

  // Fallback: scrape storefront HTML and follow product links
  const html = await fetchHtml(url.toString());
  const productUrls = findBigCartelProductLinks(html, url).slice(0, limit);
  const products: ScrapedProduct[] = [];
  for (const purl of productUrls) {
    try {
      const p = await scrapeBigCartelProductPage(purl);
      if (p) products.push(p);
    } catch {
      /* skip */
    }
  }
  return {
    source_url: sourceUrl,
    store_url: base,
    count: products.length,
    products,
    platform: "bigcartel",
  };
}

export function findBigCartelProductLinks(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  const re = /href=["']([^"']*\/product\/[^"'?#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl);
      const clean = `${u.protocol}//${u.host}${u.pathname}`;
      if (!urls.includes(clean) && /^\/product\/[^/]+/.test(u.pathname)) urls.push(clean);
    } catch {
      /* skip */
    }
  }
  return urls;
}

export function normalizeBigCartelFeedProduct(raw: any, base: string): ScrapedProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const title = stringValue(raw.name || raw.title);
  if (!title) return null;
  const url = raw.url
    ? new URL(raw.url, base).toString()
    : raw.permalink
      ? new URL(`/product/${raw.permalink}`, base).toString()
      : raw.id
        ? new URL(`/product/${raw.id}`, base).toString()
        : base;

  const images: string[] = [];
  if (Array.isArray(raw.images)) {
    for (const img of raw.images) {
      const u = stringValue(typeof img === "string" ? img : img?.url || img?.src);
      if (u) images.push(u.startsWith("//") ? `https:${u}` : u);
    }
  }

  const price = numberValue(raw.price) ?? 0;
  const variantsRaw: any[] = Array.isArray(raw.options) ? raw.options : Array.isArray(raw.variants) ? raw.variants : [];
  const variants: ScrapedVariant[] = variantsRaw.map((v) => {
    const vName = stringValue(v?.name || v?.title) || "Default";
    const vPrice = numberValue(v?.price) ?? price;
    const inv = numberValue(v?.inventory) ?? numberValue(v?.quantity) ?? (v?.sold_out ? 0 : 1);
    const available = inv > 0 && !v?.sold_out;
    const variant_data: Record<string, string> = {};
    if (vName && vName !== "Default") variant_data.Option = vName;
    return {
      title: vName,
      sku: stringValue(v?.sku) || undefined,
      price: vPrice,
      available,
      inventory_count: inv,
      variant_data,
    };
  });

  const optionValues = dedupe(variants.map((v) => v.variant_data.Option).filter((s): s is string => !!s));
  const variantOptions = optionValues.length ? [{ name: "Option", values: optionValues }] : [];

  const prices = variants.map((v) => v.price).filter((p) => Number.isFinite(p));
  const priceMin = prices.length ? Math.min(...prices) : price;
  const priceMax = prices.length ? Math.max(...prices) : price;

  return {
    id: raw.id,
    title,
    description: cleanDescription(raw.description),
    url,
    image: images[0],
    images: dedupe(images),
    price: priceMin,
    price_min: priceMin,
    price_max: priceMax,
    variant_options: variantOptions,
    variants,
    platform: "bigcartel",
    is_virtual: false,
  };
}

export async function scrapeBigCartelProductPage(productUrl: string): Promise<ScrapedProduct | null> {
  const html = await fetchHtml(productUrl);
  return parseBigCartelProductHtml(html, productUrl);
}

export function parseBigCartelProductHtml(html: string, productUrl: string): ScrapedProduct | null {
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
    platform: "bigcartel",
    is_virtual: false,
    currency: offers.currency,
  };
}
