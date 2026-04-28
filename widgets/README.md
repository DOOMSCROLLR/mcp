# DOOMSCROLLR ChatGPT App Widgets

These are self-contained OpenAI Apps SDK / MCP Apps widget templates for the DOOMSCROLLR MCP server.

Open directly in a browser for design review:

- `doomscrollr_search_pinterest_and_post.html` — Pinterest search/post card
- `doomscrollr_create_product.html` — product-from-photo card
- `doomscrollr_apply_style_preset.html` — style preset card
- `doomscrollr_top_liked_posts.html` — analytics/top-liked-posts card

In ChatGPT, each template is served as an MCP resource with MIME type:

```text
text/html;profile=mcp-app
```

The matching tool descriptor includes:

- `_meta.ui.resourceUri`
- `_meta["openai/outputTemplate"]`

At runtime, the widgets read tool data from:

- `window.openai.toolOutput`
- `window.openai.toolResponseMetadata.result`

When opened directly, each widget renders representative fallback data for visual QA.
