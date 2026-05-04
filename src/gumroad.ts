/**
 * Gumroad public storefront scraper.
 *
 * Supported inputs:
 *  - Profile URL:  https://username.gumroad.com           → list profile products
 *  - Product URL:  https://username.gumroad.com/l/slug
 *  - Product URL:  https://gumroad.com/l/slug
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
  findProductLd,
  imagesFromLd,
  numberValue,
  parseHttpUrl,
  priceFromOffers,
  stringValue,
} from "./scraped-product.js";

type Options = { limit?: number };

export async function scrapeGumroadProducts(sourceUrl: string, options: Options = {}): Promise<ScrapeResult> {
  const url = parseHttpUrl(sourceUrl);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250);

  if (isProductPath(url.pathname)) {
    const product = await scrapeGumroadProductPage(url.toString());
    return {
      source_url: sourceUrl,
      store_url: `${url.protocol}//${url.host}`,
      count: product ? 1 : 0,
      products: product ? [product] : [],
      platform: "gumroad",
    };
  }

  // Profile / storefront page — find product links and fetch each.
  const html = await fetchHtml(url.toString());
  const productUrls = findGumroadProductLinks(html, url).slice(0, limit);

  const products: ScrapedProduct[] = [];
  for (const purl of productUrls) {
    try {
      const product = await scrapeGumroadProductPage(purl);
      if (product) products.push(product);
    } catch {
      /* skip individual failures */
    }
  }

  return {
    source_url: sourceUrl,
    store_url: `${url.protocol}//${url.host}`,
    count: products.length,
    products,
    platform: "gumroad",
  };
}

function isProductPath(pathname: string): boolean {
  return /^\/l\/[^/]+/i.test(pathname);
}

export function findGumroadProductLinks(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];

  // 1) Static <a href="/l/slug"> links (older Gumroad profile pages)
  const re = /href=["']([^"']*\/l\/[^"'?#]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl);
      if (!/gumroad\.com$/i.test(u.host) && !/\.gumroad\.com$/i.test(u.host)) continue;
      const clean = `${u.protocol}//${u.host}${u.pathname}`;
      if (!urls.includes(clean) && /^\/l\/[^/]+/.test(u.pathname)) urls.push(clean);
    } catch {
      /* skip */
    }
  }

  // 2) Inertia.js `data-page` JSON (current Gumroad profile pages, 2025+)
  //    Profiles render products client-side from JSON embedded as: <div id="app" data-page="{...}">
  //    Extract products[].url or products[].permalink to build product URLs.
  const inertiaUrls = extractInertiaProductUrls(html, baseUrl);
  for (const u of inertiaUrls) {
    if (!urls.includes(u)) urls.push(u);
  }

  return urls;
}

export async function scrapeGumroadProductPage(productUrl: string): Promise<ScrapedProduct | null> {
  const html = await fetchHtml(productUrl);
  return parseGumroadProductHtml(html, productUrl);
}

export function parseGumroadProductHtml(html: string, productUrl: string): ScrapedProduct | null {
  const jsonLd = extractJsonLd(html);
  const productNode = findProductLd(jsonLd);

  // Try the embedded React data blob first — Gumroad inlines product info via data-component-props or window.GR.
  const embedded = extractGumroadEmbedded(html);

  const title = stringValue(embedded?.name || productNode?.name) || extractMetaTag(html, "og:title") || extractTitleTag(html);
  if (!title) return null;

  const description = cleanDescription(embedded?.description_html || embedded?.description || productNode?.description || extractMetaTag(html, "og:description"));

  const ldImages = imagesFromLd(productNode?.image);
  const embeddedImages: string[] = [];
  if (Array.isArray(embedded?.preview_images)) {
    for (const img of embedded.preview_images) {
      const u = stringValue(typeof img === "string" ? img : img?.url);
      if (u) embeddedImages.push(u);
    }
  }
  const ogImage = extractMetaTag(html, "og:image");
  const images = dedupe([...embeddedImages, ...ldImages, ogImage].filter((u): u is string => !!u && /^https?:\/\//i.test(u)));

  const offers = priceFromOffers(productNode?.offers);
  let price = numberValue(embedded?.price_cents) !== undefined ? (numberValue(embedded?.price_cents) as number) / 100 : offers.price;
  if (price === undefined) price = offers.min ?? 0;
  const priceMin = offers.min ?? price ?? 0;
  const priceMax = offers.max ?? price ?? 0;

  // Variants: Gumroad "variants" are option groups (e.g. tiers).
  const variantOptions: Array<{ name: string; values: string[] }> = [];
  const variants: ScrapedVariant[] = [];
  if (Array.isArray(embedded?.variants)) {
    for (const group of embedded.variants) {
      const groupName = stringValue(group?.title || group?.name) || "Option";
      const values: string[] = [];
      if (Array.isArray(group?.options)) {
        for (const opt of group.options) {
          const v = stringValue(opt?.name || opt?.title);
          if (!v) continue;
          values.push(v);
          const cents = numberValue(opt?.price_difference_cents);
          const variantPrice = Math.round(((price ?? 0) * 100 + (cents !== undefined ? cents : 0))) / 100;
          variants.push({
            title: v,
            price: variantPrice,
            available: opt?.is_pwyw ? true : opt?.max_purchase_count == null ? true : Number(opt.max_purchase_count) > 0,
            inventory_count: opt?.max_purchase_count != null ? Number(opt.max_purchase_count) : 1,
            variant_data: { [groupName]: v },
          });
        }
      }
      if (values.length) variantOptions.push({ name: groupName, values: dedupe(values) });
    }
  }

  return {
    title,
    description,
    url: productUrl,
    image: images[0],
    images,
    price: price ?? 0,
    price_min: priceMin,
    price_max: priceMax,
    variant_options: variantOptions,
    variants,
    is_virtual: true,
    platform: "gumroad",
    currency: offers.currency || (typeof embedded?.currency_code === "string" ? embedded.currency_code : undefined),
  };
}

function extractInertiaProductUrls(html: string, baseUrl: URL): string[] {
  const urls: string[] = [];
  const m = /<div\s+id=["']app["'][^>]*\sdata-page=["']([^"']+)["']/i.exec(html);
  if (!m) return urls;
  const decoded = decodeHtmlAttribute(m[1]);
  let parsed: any;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return urls;
  }
  const sections = parsed?.props?.sections;
  if (!Array.isArray(sections)) return urls;
  for (const section of sections) {
    const products = section?.search_results?.products;
    if (!Array.isArray(products)) continue;
    for (const p of products) {
      let url: string | undefined;
      if (typeof p?.url === "string" && /^https?:\/\//i.test(p.url)) {
        try {
          const u = new URL(p.url);
          url = `${u.protocol}//${u.host}${u.pathname}`;
        } catch {
          /* skip */
        }
      } else if (typeof p?.permalink === "string" && p.permalink) {
        url = `${baseUrl.protocol}//${baseUrl.host}/l/${p.permalink}`;
      }
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

function extractGumroadEmbedded(html: string): any | null {
  // Gumroad product pages embed React props in one of three places:
  //   1) Inertia.js: <div id="app" data-page='{"props":{"product":{...}}}'>  (current, 2025+)
  //   2) data-component-props='{...}' on a div  (older format)
  //   3) window.GR_INITIAL_STATE = {...};  (oldest format)
  const candidates: string[] = [];

  // 1) Inertia data-page attribute (preferred — most reliable, has the full product on product pages)
  const inertiaRe = /<div\s+id=["']app["'][^>]*\sdata-page=["']([^"']+)["']/i;
  const im = inertiaRe.exec(html);
  if (im) candidates.push(im[1]);

  // 2) data-component-props (older format)
  const dataPropsRe = /data-component-props=(?:"|')((?:[^"'\\]|\\.)*)(?:"|')/g;
  let m: RegExpExecArray | null;
  while ((m = dataPropsRe.exec(html)) !== null) {
    candidates.push(m[1]);
  }

  // 3) window.GR_INITIAL_STATE = {...}
  const stateRe = /window\.(?:GR_INITIAL_STATE|GumroadInitialState)\s*=\s*(\{[\s\S]*?\});/;
  const sm = stateRe.exec(html);
  if (sm) candidates.push(sm[1]);

  for (const raw of candidates) {
    const decoded = decodeHtmlAttribute(raw);
    try {
      const parsed = JSON.parse(decoded);
      const product = findProductObject(parsed);
      if (product) return product;
    } catch {
      /* skip */
    }
  }
  return null;
}

function findProductObject(obj: any): any | null {
  if (!obj || typeof obj !== "object") return null;
  // Direct product object: has name + price (or close to it)
  if (typeof obj.name === "string" && (obj.price_cents !== undefined || obj.formatted_price !== undefined)) return obj;
  // Inertia page wrapper: { component, props: { product: {...} } } — most common on product pages
  if (obj.props && typeof obj.props === "object" && obj.props.product && typeof obj.props.product === "object") {
    const inner = findProductObject(obj.props.product);
    if (inner) return inner;
  }
  // Direct .product field
  if (obj.product && typeof obj.product === "object") {
    const inner = findProductObject(obj.product);
    if (inner) return inner;
  }
  // Fallback: recursively search any nested objects
  for (const key of Object.keys(obj)) {
    const child = (obj as any)[key];
    if (child && typeof child === "object") {
      const found = findProductObject(child);
      if (found) return found;
    }
  }
  return null;
}

function decodeHtmlAttribute(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractMetaTag(html: string, property: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]*content=["']([^"']+)["']`, "i");
  const m = re.exec(html);
  if (m) return decodeHtmlAttribute(m[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRegex(property)}["']`, "i");
  const m2 = re2.exec(html);
  return m2 ? decodeHtmlAttribute(m2[1]) : "";
}

export function extractTitleTag(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeHtmlAttribute(m[1].trim()) : "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
