export type ShopifyScrapedVariant = {
  title?: string;
  sku?: string;
  price: number;
  available: boolean;
  inventory_count: number;
  variant_data: Record<string, string>;
};

export type ShopifyScrapedProduct = {
  id?: number | string;
  title: string;
  handle?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  description?: string;
  url: string;
  image?: string;
  images: string[];
  price: number;
  price_min: number;
  price_max: number;
  variant_options: Array<{ name: string; values: string[] }>;
  variants: ShopifyScrapedVariant[];
};

export type ShopifyScrapeResult = {
  source_url: string;
  feed_url: string;
  store_url: string;
  count: number;
  products: ShopifyScrapedProduct[];
};

type RawShopifyProduct = Record<string, any>;

type ScrapeOptions = {
  limit?: number;
};

const USER_AGENT = "Mozilla/5.0 (compatible; DOOMSCROLLR Shopify scraper; +https://doomscrollr.com)";

export async function scrapeShopifyProducts(sourceUrl: string, options: ScrapeOptions = {}): Promise<ShopifyScrapeResult> {
  const url = parseHttpUrl(sourceUrl);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 250);
  const candidates = shopifyFeedCandidates(url, limit);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.toString(), {
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) continue;

      const json = await response.json().catch(() => null) as any;
      const rawProducts = Array.isArray(json?.products)
        ? json.products
        : Array.isArray(json)
          ? json
          : [];

      const products = rawProducts
        .filter((product: unknown): product is RawShopifyProduct => !!product && typeof product === "object")
        .map((product: RawShopifyProduct) => normalizeShopifyProduct(product, candidate))
        .filter((product: ShopifyScrapedProduct | null): product is ShopifyScrapedProduct => product !== null)
        .slice(0, limit);

      if (products.length > 0) {
        return {
          source_url: sourceUrl,
          feed_url: candidate.toString(),
          store_url: `${candidate.protocol}//${candidate.host}`,
          count: products.length,
          products,
        };
      }
    } catch {
      // Try the next likely Shopify products feed URL.
    }
  }

  throw new Error("Could not find a public Shopify products.json feed for that URL.");
}

function parseHttpUrl(input: string): URL {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL must start with http:// or https://");
  }
  return url;
}

function shopifyFeedCandidates(url: URL, limit: number): URL[] {
  const candidates: URL[] = [];
  const add = (candidate: URL) => {
    candidate.searchParams.set("limit", String(limit));
    if (!candidates.some((existing) => existing.toString() === candidate.toString())) {
      candidates.push(candidate);
    }
  };

  if (url.pathname.endsWith(".json")) {
    add(new URL(url.toString()));
  }

  const base = new URL(`${url.protocol}//${url.host}`);
  add(new URL("/products.json", base));

  const cleanPath = url.pathname.replace(/\/$/, "");
  if (cleanPath.startsWith("/collections/") && !cleanPath.endsWith("/products.json")) {
    add(new URL(`${cleanPath}/products.json`, base));
  }

  if (cleanPath && cleanPath !== "/" && !cleanPath.endsWith(".json")) {
    add(new URL(`${cleanPath}/products.json`, base));
  }

  return candidates;
}

function normalizeShopifyProduct(product: RawShopifyProduct, feedUrl: URL): ShopifyScrapedProduct | null {
  const title = stringValue(product.title || product.name);
  if (!title) return null;

  const handle = stringValue(product.handle || product.slug);
  const base = `${feedUrl.protocol}//${feedUrl.host}`;
  const url = absoluteUrl(
    stringValue(product.url || product.permalink) || (handle ? `/products/${handle}` : ""),
    base
  );
  if (!url) return null;

  const images = normalizeImages(product.images ?? product.image);
  const optionNames = normalizeOptionNames(product.options);
  const variants = normalizeVariants(product.variants, optionNames);
  const prices = variants.map((variant) => variant.price).filter((price) => Number.isFinite(price));
  const fallbackPrice = numberValue(product.price) ?? 0;
  const priceMin = prices.length ? Math.min(...prices) : fallbackPrice;
  const priceMax = prices.length ? Math.max(...prices) : fallbackPrice;
  const variantOptions = buildVariantOptions(optionNames, variants);

  return {
    id: product.id,
    title,
    handle: handle || undefined,
    vendor: stringValue(product.vendor) || undefined,
    product_type: stringValue(product.product_type || product.type) || undefined,
    tags: normalizeTags(product.tags),
    description: cleanDescription(product.body_html || product.description || product.body),
    url,
    image: images[0],
    images,
    price: priceMin,
    price_min: priceMin,
    price_max: priceMax,
    variant_options: variantOptions,
    variants,
  };
}

function normalizeImages(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const urls = list
    .map((image) => {
      if (typeof image === "string") return image;
      if (image && typeof image === "object") {
        const record = image as Record<string, unknown>;
        return stringValue(record.src || record.url || record.image);
      }
      return "";
    })
    .map((url) => url.startsWith("//") ? `https:${url}` : url)
    .filter((url) => /^https?:\/\//i.test(url));

  return Array.from(new Set(urls));
}

function normalizeOptionNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option, index) => {
      if (typeof option === "string") return option;
      if (option && typeof option === "object") {
        return stringValue((option as Record<string, unknown>).name) || `Option ${index + 1}`;
      }
      return `Option ${index + 1}`;
    })
    .filter((name) => name && name.toLowerCase() !== "title");
}

function normalizeVariants(raw: unknown, optionNames: string[]): ShopifyScrapedVariant[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .filter((variant): variant is Record<string, any> => !!variant && typeof variant === "object")
    .map((variant) => {
      const variantData: Record<string, string> = {};
      for (let i = 1; i <= 3; i += 1) {
        const value = stringValue(variant[`option${i}`]);
        if (!value || value.toLowerCase() === "default title") continue;
        variantData[optionNames[i - 1] || `Option ${i}`] = value;
      }

      const available = Boolean(variant.available ?? true);
      const explicitInventory = numberValue(variant.inventory_quantity);

      return {
        title: stringValue(variant.title) || undefined,
        sku: stringValue(variant.sku) || undefined,
        price: numberValue(variant.price) ?? 0,
        available,
        inventory_count: explicitInventory ?? (available ? 1 : 0),
        variant_data: variantData,
      };
    });
}

function buildVariantOptions(optionNames: string[], variants: ShopifyScrapedVariant[]) {
  return optionNames
    .map((name) => ({
      name,
      values: Array.from(new Set(variants.map((variant) => variant.variant_data[name]).filter(Boolean))),
    }))
    .filter((option) => option.values.length > 0);
}

function normalizeTags(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.map((tag) => stringValue(tag)).filter(Boolean);
  const tagString = stringValue(raw);
  if (!tagString) return undefined;
  return tagString.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function cleanDescription(raw: unknown): string | undefined {
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
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000) || undefined;
}

function absoluteUrl(value: string, base: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}
