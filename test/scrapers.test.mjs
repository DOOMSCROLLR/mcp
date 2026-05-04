import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGumroadProductHtml, findGumroadProductLinks } from "../dist/gumroad.js";
import { parsePayhipProductHtml, findPayhipProductLinks } from "../dist/payhip.js";
import { parseBandcampItemHtml, findBandcampItemLinks } from "../dist/bandcamp.js";
import { parseBigCartelProductHtml, normalizeBigCartelFeedProduct, findBigCartelProductLinks } from "../dist/bigcartel.js";

test("Gumroad: parse product HTML with embedded React props", () => {
  const props = {
    product: {
      name: "AI Agents Handbook",
      description: "<p>A complete guide to building AI agents.</p>",
      price_cents: 2999,
      currency_code: "USD",
      preview_images: [{ url: "https://public-files.gumroad.com/cover.jpg" }],
      variants: [
        {
          title: "Tier",
          options: [
            { name: "Standard", price_difference_cents: 0, max_purchase_count: null },
            { name: "Premium", price_difference_cents: 2000, max_purchase_count: 100 },
          ],
        },
      ],
    },
  };
  const encoded = JSON.stringify(props).replace(/"/g, "&quot;");
  const html = `<!doctype html><html><head>
    <title>AI Agents Handbook</title>
    <meta property="og:title" content="AI Agents Handbook" />
    <meta property="og:image" content="https://public-files.gumroad.com/og.jpg" />
    <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "AI Agents Handbook", offers: { "@type": "Offer", price: "29.99", priceCurrency: "USD" } })}</script>
    </head><body>
    <div data-component-props="${encoded}"></div>
    </body></html>`;
  const product = parseGumroadProductHtml(html, "https://example.gumroad.com/l/agents");
  assert.ok(product, "expected a product");
  assert.equal(product.title, "AI Agents Handbook");
  assert.equal(product.price, 29.99);
  assert.equal(product.is_virtual, true);
  assert.equal(product.platform, "gumroad");
  assert.ok(product.images.length >= 1);
  assert.equal(product.variant_options.length, 1);
  assert.equal(product.variants.length, 2);
  assert.equal(product.variants[1].price, 49.99);
});

test("Gumroad: find product links on profile page", () => {
  const html = `<a href="/l/agents">A</a><a href="https://other.gumroad.com/l/widget">B</a><a href="/blog/post">C</a>`;
  const urls = findGumroadProductLinks(html, new URL("https://example.gumroad.com"));
  assert.equal(urls.length, 2);
  assert.ok(urls.some((u) => u.endsWith("/l/agents")));
  assert.ok(urls.some((u) => u.endsWith("/l/widget")));
});

test("Payhip: parse product HTML with JSON-LD", () => {
  const html = `<html><head>
    <meta property="og:title" content="Notion Productivity Pack" />
    <meta property="og:image" content="https://payhip.com/x.jpg" />
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Notion Productivity Pack",
      description: "Templates",
      image: ["https://payhip.com/img1.jpg"],
      offers: { "@type": "Offer", price: "19.00", priceCurrency: "USD" },
    })}</script>
  </head></html>`;
  const product = parsePayhipProductHtml(html, "https://payhip.com/b/abc123");
  assert.ok(product);
  assert.equal(product.title, "Notion Productivity Pack");
  assert.equal(product.price, 19);
  assert.equal(product.is_virtual, true);
  assert.equal(product.platform, "payhip");
});

test("Payhip: find product links", () => {
  const html = `<a href="/b/abc"></a><a href="/b/def?utm=x"></a><a href="/about"></a>`;
  const urls = findPayhipProductLinks(html, new URL("https://payhip.com/storeuser"));
  assert.equal(urls.length, 2);
});

test("Bandcamp: parse album with data-tralbum", () => {
  const tralbum = {
    current: { title: "Sample Album", about: "An album about samples", minimum_price: 7.0, currency: "USD" },
    packages: [],
  };
  const html = `<html><head>
    <meta property="og:title" content="Sample Album by Artist" />
    <meta property="og:image" content="https://f4.bcbits.com/img/cover.jpg" />
    <script type="application/ld+json">${JSON.stringify({ "@type": "MusicAlbum", name: "Sample Album", offers: { "@type": "Offer", price: 7.0, priceCurrency: "USD" } })}</script>
  </head><body>
    <div data-tralbum='${JSON.stringify(tralbum).replace(/'/g, "&#39;")}'></div>
  </body></html>`;
  const product = parseBandcampItemHtml(html, "https://artist.bandcamp.com/album/sample");
  assert.ok(product);
  assert.equal(product.title, "Sample Album");
  assert.equal(product.price, 7);
  assert.equal(product.is_virtual, true);
  assert.equal(product.platform, "bandcamp");
});

test("Bandcamp: physical merch detection via packages", () => {
  const tralbum = {
    current: { title: "Vinyl LP", minimum_price: 25 },
    packages: [{ id: 1, type_name: "Vinyl LP", price: 25 }],
  };
  const html = `<div data-tralbum='${JSON.stringify(tralbum)}'></div><meta property="og:title" content="Vinyl LP" />`;
  const product = parseBandcampItemHtml(html, "https://artist.bandcamp.com/album/lp");
  assert.ok(product);
  assert.equal(product.is_virtual, false);
});

test("Bandcamp: find item links", () => {
  const html = `<a href="/album/one"></a><a href="/track/two"></a><a href="/merch"></a>`;
  const urls = findBandcampItemLinks(html, new URL("https://artist.bandcamp.com/music"));
  assert.equal(urls.length, 2);
});

test("Big Cartel: normalize products.json feed item", () => {
  const raw = {
    id: 100,
    name: "Tour Tee",
    description: "Limited.",
    price: 35,
    url: "/product/tour-tee",
    images: ["//img.bigcartel.com/x.jpg"],
    options: [
      { name: "S", price: 35, inventory: 10 },
      { name: "M", price: 35, inventory: 0, sold_out: true },
    ],
  };
  const product = normalizeBigCartelFeedProduct(raw, "https://store.bigcartel.com");
  assert.ok(product);
  assert.equal(product.title, "Tour Tee");
  assert.equal(product.price, 35);
  assert.equal(product.platform, "bigcartel");
  assert.equal(product.is_virtual, false);
  assert.equal(product.variants.length, 2);
  assert.equal(product.variant_options.length, 1);
  assert.equal(product.images[0], "https://img.bigcartel.com/x.jpg");
});

test("Big Cartel: parse product HTML with JSON-LD", () => {
  const html = `<html><head>
    <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Hoodie", offers: { "@type": "Offer", price: "60.00", priceCurrency: "USD" } })}</script>
  </head></html>`;
  const product = parseBigCartelProductHtml(html, "https://store.bigcartel.com/product/hoodie");
  assert.ok(product);
  assert.equal(product.title, "Hoodie");
  assert.equal(product.price, 60);
  assert.equal(product.platform, "bigcartel");
});

test("Big Cartel: find product links", () => {
  const html = `<a href="/product/a"></a><a href="/product/b"></a><a href="/about"></a>`;
  const urls = findBigCartelProductLinks(html, new URL("https://store.bigcartel.com"));
  assert.equal(urls.length, 2);
});
