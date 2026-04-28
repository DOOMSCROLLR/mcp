import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

export const WIDGET_URIS = {
  pinterest: "ui://doomscrollr/widgets/pinterest-v1.html",
  product: "ui://doomscrollr/widgets/product-v1.html",
  style: "ui://doomscrollr/widgets/style-v1.html",
  analytics: "ui://doomscrollr/widgets/analytics-v1.html",
} as const;

type WidgetKind = keyof typeof WIDGET_URIS;

const WIDGET_FILES: Record<WidgetKind, string> = {
  pinterest: "doomscrollr_search_pinterest_and_post.html",
  product: "doomscrollr_create_product.html",
  style: "doomscrollr_apply_style_preset.html",
  analytics: "doomscrollr_top_liked_posts.html",
};

function readWidgetHtml(fileName: string): string {
  return readFileSync(join(__dirname, "..", "widgets", fileName), "utf8");
}

export function registerWidgetResources(server: McpServer) {
  for (const [kind, uri] of Object.entries(WIDGET_URIS) as Array<[WidgetKind, string]>) {
    server.registerResource(
      `doomscrollr-${kind}-widget`,
      uri,
      {
        title: `DOOMSCROLLR ${kind} card`,
        description: `Inline DOOMSCROLLR ${kind} result card for ChatGPT Apps.`,
        mimeType: WIDGET_MIME_TYPE,
      } as any,
      async () => ({
        contents: [
          {
            uri,
            mimeType: WIDGET_MIME_TYPE,
            text: readWidgetHtml(WIDGET_FILES[kind]),
            _meta: {
              ui: {
                prefersBorder: false,
                csp: {
                  connectDomains: ["https://doomscrollr.com", "https://mcp.doomscrollr.com"],
                  resourceDomains: [
                    "https://doomscrollr.com",
                    "https://images.unsplash.com",
                    "https://i.pinimg.com",
                    "https://*.pinimg.com",
                    "https://fonts.googleapis.com",
                    "https://fonts.gstatic.com",
                  ],
                },
              },
            },
          },
        ],
      })
    );
  }
}

export function widgetToolMeta(kind: WidgetKind, invoking: string, invoked: string) {
  const uri = WIDGET_URIS[kind];
  return {
    ui: { resourceUri: uri },
    "openai/outputTemplate": uri,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

export function widgetResult(kind: WidgetKind, result: unknown, structuredContent?: Record<string, unknown>) {
  return {
    structuredContent: structuredContent ?? summarize(kind, result),
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    _meta: {
      widget: kind,
      result,
    },
  };
}

function summarize(kind: WidgetKind, result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return { ok: true };
  const data = result as Record<string, any>;

  if (kind === "pinterest") {
    return {
      query: data.query,
      created: data.created,
      status: "drafts_created",
    };
  }

  if (kind === "product") {
    return {
      title: data.title ?? data.product?.title,
      price: data.price ?? data.product?.price,
      status: "product_created",
    };
  }

  if (kind === "style") {
    return {
      preset: data.preset,
      status: "style_applied",
    };
  }

  if (kind === "analytics") {
    return {
      days: data.days,
      total_likes: data.total_likes,
      top_posts: Array.isArray(data.top_posts) ? data.top_posts.slice(0, 5) : [],
    };
  }

  return { ok: true };
}
