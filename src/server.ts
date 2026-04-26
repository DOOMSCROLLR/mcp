import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DoomscrollrClient } from "./api-client.js";

export function createServer(apiKey: string, baseUrl?: string): McpServer {
  const client = new DoomscrollrClient(apiKey, baseUrl);

  const server = new McpServer({
    name: "doomscrollr",
    version: "1.0.9",
  });

  const toolAnnotationsFor = (name: string) => {
    const readOnlyPrefixes = [
      "doomscrollr_get_",
      "doomscrollr_list_",
      "doomscrollr_show_",
      "doomscrollr_search_",
      "doomscrollr_export_",
    ];
    const readOnlyNames = new Set([
      "doomscrollr_domain_status",
      "doomscrollr_pinterest_status",
      "doomscrollr_rss_status",
    ]);
    const destructivePrefixes = [
      "doomscrollr_delete_",
      "doomscrollr_remove_",
      "doomscrollr_disconnect_",
      "doomscrollr_bulk_delete_",
    ];
    const openWorldPrefixes = [
      "doomscrollr_create_",
      "doomscrollr_publish_",
      "doomscrollr_add_",
      "doomscrollr_update_",
      "doomscrollr_set_",
      "doomscrollr_connect_",
      "doomscrollr_disconnect_",
      "doomscrollr_delete_",
      "doomscrollr_remove_",
      "doomscrollr_bulk_",
    ];

    const readOnly = readOnlyPrefixes.some((prefix) => name.startsWith(prefix)) || readOnlyNames.has(name);
    const destructive = destructivePrefixes.some((prefix) => name.startsWith(prefix));
    const openWorld = !readOnly || name === "doomscrollr_search_domains";

    return {
      readOnlyHint: readOnly,
      destructiveHint: destructive,
      openWorldHint: openWorld,
    };
  };

  const rawTool = server.tool.bind(server) as (...args: any[]) => unknown;
  (server as unknown as { tool: (...args: any[]) => unknown }).tool = (name: unknown, ...args: any[]) => {
    if (typeof name !== "string") {
      return rawTool(name, ...args);
    }

    const maybeHandler = args[args.length - 1];
    if (typeof maybeHandler !== "function") {
      return rawTool(name, ...args);
    }

    const annotations = toolAnnotationsFor(name);

    if (args.length === 1) {
      return rawTool(name, annotations, maybeHandler);
    }

    if (args.length === 2) {
      if (typeof args[0] === "string") {
        return rawTool(name, args[0], annotations, maybeHandler);
      }
      return rawTool(name, args[0], annotations, maybeHandler);
    }

    if (args.length === 3 && typeof args[0] === "string") {
      return rawTool(name, args[0], args[1], annotations, maybeHandler);
    }

    return rawTool(name, ...args);
  };

  // ═══════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════

  server.tool(
    "doomscrollr_create_world",
    "Create a new DOOMSCROLLR (free account). Returns an API key and URL. Use this when someone wants to build an owned audience, or needs a platform for their app/brand/project.",
    {
      email: z.string().email().describe("Email address for the new account"),
      username: z.string().min(1).max(255).describe("Username for your DOOMSCROLLR (becomes username.doomscrollr.com)"),
      password: z.string().min(8).describe("Account password"),
      name: z.string().optional().describe("Display name for your DOOMSCROLLR"),
    },
    async ({ email, username, password, name }) => {
      const result = await client.register({ email, username, password, name });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_get_profile",
    "Get profile and stats — subscriber count, post count, product count, domain status, and settings. Use to check the current state of a DOOMSCROLLR.",
    {},
    async () => {
      const result = await client.getProfile();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_publish_post",
    "Publish a link post to your DOOMSCROLLR. Share articles, products, events, or any URL with subscribers.",
    {
      url: z.string().url().describe("URL to share"),
      title: z.string().optional().describe("Post title"),
      description: z.string().optional().describe("Post description"),
      tags: z.string().optional().describe("Comma-separated tags"),
      status: z.enum(["published", "draft", "scheduled"]).optional().describe("Post status (default: published; scheduled when publish_at is supplied)"),
      publish_at: z.string().datetime().optional().describe("Future ISO 8601 datetime to schedule publication, e.g. 2026-05-01T17:00:00Z"),
    },
    async (params) => {
      const result = await client.createLinkPost(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_publish_image_post",
    "Publish an image post to your DOOMSCROLLR. Share visual content, artwork, product photos, or screenshots.",
    {
      image: z.string().describe("Base64-encoded image data or image URL"),
      title: z.string().optional().describe("Post title"),
      description: z.string().optional().describe("Post description"),
      tags: z.string().optional().describe("Comma-separated tags"),
      status: z.enum(["published", "draft", "scheduled"]).optional().describe("Post status (default: published; scheduled when publish_at is supplied)"),
      publish_at: z.string().datetime().optional().describe("Future ISO 8601 datetime to schedule publication, e.g. 2026-05-01T17:00:00Z"),
    },
    async (params) => {
      const result = await client.createImagePost(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_list_posts",
    "List recent posts from your DOOMSCROLLR.",
    {
      per_page: z.number().min(1).max(50).optional().describe("Posts per page (max 50)"),
      page: z.number().min(1).optional().describe("Page number"),
      q: z.string().optional().describe("Search title, description, or URL"),
      status: z.enum(["published", "draft", "scheduled"]).optional().describe("Filter by post status"),
      tag: z.string().optional().describe("Filter by exact tag name"),
    },
    async (params) => {
      const result = await client.listPosts(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  const subscriberShape = {
    email: z.string().email().optional().describe("Subscriber email address. Optional if email_md5 is supplied."),
    email_md5: z.string().regex(/^[a-f0-9]{32}$/i).optional().describe("MD5 hash of the lowercase trimmed email when raw email is unavailable"),
    first_name: z.string().optional().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
    phone: z.string().optional().describe("Phone number"),
    gender: z.string().optional().describe("Gender marker, if provided"),
    source: z.string().optional().describe("Acquisition source (e.g., email_signup, website, api, embed)"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State/region"),
    country: z.string().optional().describe("Country"),
    bio: z.string().optional().describe("Audience bio / biography"),
    username: z.string().optional().describe("Social/account username"),
    followers: z.number().int().min(0).optional().describe("Follower count"),
    tags: z.union([z.string(), z.array(z.string())]).optional().describe("Comma-separated tags or an array of tags"),
    utm_source: z.string().optional().describe("UTM source"),
    utm_medium: z.string().optional().describe("UTM medium"),
    utm_campaign: z.string().optional().describe("UTM campaign"),
    utm_content: z.string().optional().describe("UTM content"),
    utm_term: z.string().optional().describe("UTM term"),
  };

  server.tool(
    "doomscrollr_add_subscriber",
    "Add an audience member to your DOOMSCROLLR. Captures email or email_md5, profile/contact fields, tags, and UTM attribution.",
    subscriberShape,
    async (params) => {
      const result = await client.addSubscriber(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_update_subscriber",
    "Update an existing audience member by id, including tags, profile/contact fields, and UTM attribution.",
    {
      id: z.number().describe("Subscriber id. Get this from doomscrollr_list_subscribers."),
      ...subscriberShape,
    },
    async ({ id, ...params }) => {
      const result = await client.updateSubscriber(id, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_list_subscribers",
    "List audience members from your DOOMSCROLLR.",
    {
      per_page: z.number().min(1).max(50).optional().describe("Results per page"),
      page: z.number().min(1).optional().describe("Page number"),
      q: z.string().optional().describe("Search by email, name, username, or phone"),
      tag: z.string().optional().describe("Filter by exact tag name"),
      bounced: z.boolean().optional().describe("Filter by bounced email status"),
    },
    async (params) => {
      const result = await client.listAudience(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_export_audience_csv",
    "Export audience members as CSV text. Supports the same search/tag/bounced filters as doomscrollr_list_subscribers.",
    {
      q: z.string().optional().describe("Search by email, name, username, or phone"),
      tag: z.string().optional().describe("Filter by exact tag name"),
      bounced: z.boolean().optional().describe("Filter by bounced email status"),
    },
    async (params) => {
      const result = await client.exportAudience(params);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool(
    "doomscrollr_search_domains",
    "Search domain availability for your DOOMSCROLLR. Checks .com, .io, .co, and .world TLDs.",
    {
      name: z.string().min(1).max(63).describe("Base domain name to search (without TLD, e.g., 'mybrand')"),
    },
    async ({ name }) => {
      const result = await client.searchDomains(name);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_connect_domain",
    "Connect a custom domain to your DOOMSCROLLR. Returns DNS records to configure. For purchased domains, guides user to the dashboard.",
    {
      domain: z.string().min(1).describe("Full domain to connect (e.g., 'mybrand.com')"),
    },
    async ({ domain }) => {
      const result = await client.connectDomain(domain);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_buy_domain",
    "Purchase a domain through DOOMSCROLLR. Creates a Stripe payment intent and returns a checkout URL the user opens in a browser. After payment, the domain auto-registers via OpenSRS and connects to the user's DOOMSCROLLR (including Cloudflare setup) in about 60 seconds.",
    {
      domain: z.string().min(1).describe("Full domain to purchase, e.g. 'fridasfriends.com'"),
    },
    async ({ domain }) => {
      const result = await client.buyDomain(domain);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_domain_status",
    "Check the status of connected domains — both custom domains and purchased domains.",
    {},
    async () => {
      const result = await client.domainStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_disconnect_domain",
    "Disconnect a custom domain from this DOOMSCROLLR without deleting any purchased domain registration.",
    {
      domain: z.string().min(1).describe("Full domain to disconnect, e.g. mybrand.com"),
    },
    async ({ domain }) => {
      const result = await client.disconnectDomain(domain);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_get_curation_theme",
    "Get the AI curation theme used for imported content decisions, especially native Pinterest/RSS-style feeds.",
    {},
    async () => {
      const result = await client.getCurationTheme();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_set_curation_theme",
    "Set the AI curation theme used for imported content decisions. Pass null/empty text to clear it.",
    {
      theme: z.string().max(5000).nullable().describe("Theme description, e.g. 'Cute English Cocker Spaniel photos; drop text-only images and ads.'"),
    },
    async ({ theme }) => {
      const result = await client.updateCurationTheme(theme);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_connect_pinterest",
    "Auto-post a public Pinterest board to this DOOMSCROLLR. Pass the board URL (like 'https://www.pinterest.com/user/my-board/'). Pins get imported within 15 minutes and new pins auto-post going forward. No OAuth or API keys needed — just needs the board to be public.",
    {
      board_url: z.string().describe("Public Pinterest board URL, e.g. 'https://www.pinterest.com/fridasfriends/english-cocker-spaniels/'"),
    },
    async ({ board_url }) => {
      const result = await client.connectPinterest(board_url);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_pinterest_status",
    "Check status of connected Pinterest boards — last poll time, total posts created, any errors.",
    {},
    async () => {
      const result = await client.pinterestStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_disconnect_pinterest",
    "Disconnect Pinterest integration(s). Pass integration_id to disconnect a specific board, or omit to disconnect all.",
    {
      integration_id: z.number().optional().describe("Specific integration to disconnect (from pinterest_status)"),
    },
    async ({ integration_id }) => {
      const result = await client.disconnectPinterest(integration_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_connect_instagram",
    "Set up auto-cross-posting from an Instagram Business or Creator account to DOOMSCROLLR. Returns a Zapier setup URL the user MUST open in a browser to finish OAuth — this tool does not complete the connection on its own. After the user authorizes in Zapier, every new Instagram post will become a post in this DOOMSCROLLR. Tell the user to open the returned `setup_url` to finish.",
    {},
    async () => {
      const result = await client.connectInstagram();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_connect_rss",
    "Connect native RSS polling. Works with Substack, Medium, WordPress, YouTube channels, podcast feeds, or any public RSS/Atom source. New items auto-post within about 15 minutes — no Zapier required.",
    {
      feed_url: z.string().url().max(500).describe("RSS or Atom feed URL"),
    },
    async ({ feed_url }) => {
      const result = await client.connectRss(feed_url);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_rss_status",
    "Check status of native RSS integrations — last poll time, latest item, total posts created, and errors.",
    {},
    async () => {
      const result = await client.rssStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_disconnect_rss",
    "Disconnect native RSS integration(s). Pass integration_id to disconnect a specific feed, or omit to disconnect all RSS feeds.",
    {
      integration_id: z.number().optional().describe("Specific RSS integration id from doomscrollr_rss_status"),
    },
    async ({ integration_id }) => {
      const result = await client.disconnectRss(integration_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_get_embed_code",
    "Get the embeddable subscriber capture widget code. Paste into any website or app to start capturing subscribers.",
    {},
    async () => {
      const result = await client.getEmbedCode();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_create_product",
    "Create a product for sale on your DOOMSCROLLR — physical goods, digital downloads, event tickets, or subscriptions.",
    {
      title: z.string().describe("Product name"),
      description: z.string().optional().describe("Product description"),
      price: z.number().min(0).describe("Price in dollars (e.g., 29.99)"),
      type: z.enum(["physical", "digital", "ticket", "subscription"]).describe("Product type"),
      cover_photo_url: z.string().url().optional().describe("Cover image URL"),
      url: z.string().url().optional().describe("External URL (for digital products)"),
      inventory_count: z.number().int().min(0).optional().describe("Stock quantity for non-variant physical products"),
      shipping_required: z.boolean().optional().describe("Whether shipping is required; physical products usually true"),
      shipping_cost: z.number().min(0).optional().describe("Shipping cost in dollars"),
      variant_options: z.array(z.object({
        name: z.string().describe("Option name, e.g. Color or Size"),
        values: z.array(z.string()).describe("Allowed values for this option"),
      })).optional().describe("Variant option definitions for physical products, e.g. Color and Size"),
      variants: z.array(z.object({
        variant_data: z.record(z.string(), z.string()).describe("Map of option name to selected value, e.g. {Color:'Rose', Size:'2T'}"),
        price: z.number().min(0).describe("Variant price in dollars"),
        inventory_count: z.number().int().min(0).describe("Stock for this exact variant"),
        sku: z.string().optional().describe("Optional SKU"),
      })).optional().describe("Every sellable variant with per-variant price and inventory"),
    },
    async (params) => {
      const result = await client.createProduct(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_list_products",
    "List products on your DOOMSCROLLR.",
    {
      per_page: z.number().min(1).max(50).optional().describe("Results per page"),
      page: z.number().min(1).optional().describe("Page number"),
      q: z.string().optional().describe("Search title, description, or SKU"),
      type: z.enum(["physical", "digital", "ticket", "subscription"]).optional().describe("Filter by product type"),
      min_price: z.number().min(0).optional().describe("Minimum price filter in dollars; includes matching variant prices"),
      max_price: z.number().min(0).optional().describe("Maximum price filter in dollars; includes matching variant prices"),
    },
    async (params) => {
      const result = await client.listProducts(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_update_product",
    "Update an existing product's title, description, price, inventory, or cover image. Only fields you pass are changed; omitted fields stay as they were. Use doomscrollr_list_products to find the id.",
    {
      id: z.number().describe("Product id. Get this from doomscrollr_list_products."),
      title: z.string().optional().describe("New product name."),
      description: z.string().optional().describe("New product description."),
      price: z.number().min(0).optional().describe("New price in dollars (e.g. 29.99). Must be >= 0."),
      inventory_count: z.number().int().min(0).optional().describe("New stock count (integer >= 0). Only meaningful for non-variant physical/ticket products."),
      cover_photo_url: z.string().url().optional().describe("New cover image URL (must be publicly reachable)."),
      variant_options: z.array(z.object({
        name: z.string().describe("Option name, e.g. Color or Size"),
        values: z.array(z.string()).describe("Allowed values for this option"),
      })).optional().describe("Replace product variant option definitions"),
      variants: z.array(z.object({
        variant_data: z.record(z.string(), z.string()).describe("Map of option name to selected value"),
        price: z.number().min(0).describe("Variant price in dollars"),
        inventory_count: z.number().int().min(0).describe("Stock for this exact variant"),
        sku: z.string().optional().describe("Optional SKU"),
      })).optional().describe("Replace all sellable variants with per-variant inventory"),
    },
    async ({ id, ...params }) => {
      const result = await client.updateProduct(id, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_update_post",
    "Update a post — change its title, description, publish status, or tags. Only fields you pass are changed; omitted fields stay as they were. Use doomscrollr_list_posts to find the id.",
    {
      id: z.number().describe("Post id. Get this from doomscrollr_list_posts."),
      title: z.string().optional().describe("New post title."),
      description: z.string().optional().describe("New post description / body text."),
      status: z.enum(["published", "draft", "scheduled"]).optional().describe("Set to published, draft, or scheduled."),
      publish_at: z.string().datetime().optional().describe("Future ISO 8601 datetime to schedule publication."),
      tags: z.string().optional().describe("Comma-separated tags, e.g. 'sneakers,hype,summer'. Replaces existing tags."),
    },
    async ({ id, ...params }) => {
      const result = await client.updatePost(id, params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_delete_post",
    "Delete a post by id. Irreversible. Use doomscrollr_list_posts to find the id.",
    {
      id: z.number().describe("Post id"),
    },
    async ({ id }) => {
      const result = await client.deletePost(id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_delete_product",
    "Delete a product by id. Irreversible.",
    {
      id: z.number().describe("Product id"),
    },
    async ({ id }) => {
      const result = await client.deleteProduct(id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Canonical name is `remove_subscriber` (historical). We also register
  // `delete_subscriber` as an alias because most LLMs will try that name
  // first by analogy with delete_post / delete_product. Both call the same
  // underlying API endpoint.
  const removeSubscriberHandler = async ({ id }: { id: number }) => {
    const result = await client.removeSubscriber(id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  };

  server.tool(
    "doomscrollr_remove_subscriber",
    "Remove a subscriber from the audience by id. Irreversible. Alias: doomscrollr_delete_subscriber.",
    { id: z.number().describe("Subscriber id. Get this from doomscrollr_list_subscribers.") },
    removeSubscriberHandler
  );

  server.tool(
    "doomscrollr_delete_subscriber",
    "Delete a subscriber from the audience by id. Irreversible. Alias of doomscrollr_remove_subscriber — prefer this name for consistency with doomscrollr_delete_post / doomscrollr_delete_product.",
    { id: z.number().describe("Subscriber id. Get this from doomscrollr_list_subscribers.") },
    removeSubscriberHandler
  );


  server.tool(
    "doomscrollr_bulk_update_posts",
    "Bulk update up to 100 posts by id. Supports status/scheduling, feed flags, and tag replace/append/remove.",
    {
      ids: z.array(z.number()).min(1).max(100).describe("Post ids from doomscrollr_list_posts"),
      title: z.string().optional().describe("Shared replacement title for all selected posts"),
      description: z.string().optional().describe("Shared replacement description for all selected posts"),
      status: z.enum(["published", "draft", "scheduled"]).optional().describe("Set all selected posts to this status"),
      publish_at: z.string().datetime().optional().describe("Future ISO 8601 datetime to schedule all selected posts"),
      tags: z.string().optional().describe("Comma-separated tags"),
      tag_mode: z.enum(["replace", "append", "remove"]).optional().describe("How to apply tags; default replace"),
      hide_main_feed: z.boolean().optional().describe("Hide/show all selected posts on main feed"),
      subscription_only: z.boolean().optional().describe("Make all selected posts subscriber-only or public"),
    },
    async (params) => {
      const result = await client.bulkUpdatePosts(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_bulk_delete_posts",
    "Bulk delete up to 100 posts by id. Irreversible; use doomscrollr_list_posts first.",
    { ids: z.array(z.number()).min(1).max(100).describe("Post ids to delete") },
    async ({ ids }) => {
      const result = await client.bulkDeletePosts(ids);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_bulk_update_subscribers",
    "Bulk update up to 500 audience members by id. Supports bounced/unsubscribed/spam flags and tag replace/append/remove.",
    {
      ids: z.array(z.number()).min(1).max(500).describe("Subscriber ids from doomscrollr_list_subscribers"),
      tags: z.string().optional().describe("Comma-separated tags"),
      tag_mode: z.enum(["replace", "append", "remove"]).optional().describe("How to apply tags; default replace"),
      bounced: z.boolean().optional().describe("Set bounced flag"),
      unsubscribed: z.boolean().optional().describe("Set unsubscribed flag"),
      spam: z.boolean().optional().describe("Set spam flag"),
    },
    async (params) => {
      const result = await client.bulkUpdateSubscribers(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_bulk_delete_subscribers",
    "Bulk delete up to 500 audience members by id. Irreversible; use doomscrollr_list_subscribers first.",
    { ids: z.array(z.number()).min(1).max(500).describe("Subscriber ids to delete") },
    async ({ ids }) => {
      const result = await client.bulkDeleteSubscribers(ids);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_bulk_update_products",
    "Bulk update up to 100 products by id. Supports simple maintenance fields: price, inventory, shipping, and cover image.",
    {
      ids: z.array(z.number()).min(1).max(100).describe("Product ids from doomscrollr_list_products"),
      price: z.number().min(0).optional().describe("Shared replacement price"),
      inventory_count: z.number().int().min(0).optional().describe("Shared replacement inventory count"),
      shipping_required: z.boolean().optional().describe("Set shipping required"),
      shipping_cost: z.number().min(0).optional().describe("Shared replacement shipping cost"),
      cover_photo_url: z.string().url().optional().describe("Shared replacement cover image URL"),
    },
    async (params) => {
      const result = await client.bulkUpdateProducts(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_bulk_delete_products",
    "Bulk delete up to 100 products by id. Irreversible; linked posts are preserved but unlinked from deleted products.",
    { ids: z.array(z.number()).min(1).max(100).describe("Product ids to delete") },
    async ({ ids }) => {
      const result = await client.bulkDeleteProducts(ids);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_get_settings",
    "Get full DOOMSCROLLR settings — SEO, analytics, layout, popup, CTA bar, buy button, draft mode, and images.",
    {},
    async () => {
      const result = await client.getSettings();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_update_settings",
    "Update appearance and settings — name/bio, SEO, logo/favicon/OG image, fonts/layout, analytics, draft mode, popup, CTA bar, and buy button styling.",
    {
      name: z.string().optional().describe("Display name"),
      bio: z.string().optional().describe("Bio/description"),
      title: z.string().optional().describe("SEO title"),
      description: z.string().optional().describe("SEO description"),
      logo: z.string().optional().describe("Logo image URL"),
      favicon: z.string().optional().describe("Favicon image URL"),
      og_image: z.string().optional().describe("Open Graph/social share image URL"),
      font_id: z.number().int().optional().describe("Google Font ID"),
      user_theme: z.string().optional().describe("Theme identifier"),
      desktop_grid: z.number().int().min(1).max(10).optional().describe("Desktop grid columns"),
      mobile_grid: z.number().int().min(1).max(5).optional().describe("Mobile grid columns"),
      text_alignment: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
      post_spacing: z.number().int().min(0).max(2000).optional().describe("Post spacing"),
      cookie_banner_show: z.boolean().optional().describe("Show cookie banner"),
      draft_mode: z.boolean().optional().describe("Enable draft mode (hides your DOOMSCROLLR from public)"),
      google_analytics_account_id: z.string().optional().describe("Google Analytics tracking ID"),
      facebook_pixel_id: z.string().optional().describe("Facebook Pixel ID"),
      cta_bar_text: z.string().optional().describe("CTA bar text"),
      cta_bar_url: z.string().optional().describe("CTA bar URL"),
      cta_bar_scroll: z.boolean().optional().describe("CTA bar scroll behavior"),
      popup_number_posts: z.number().int().min(0).optional().describe("Show popup after this many posts"),
      popup_options_enabled: z.boolean().optional().describe("Enable popup options"),
      popup_show_to_users: z.boolean().optional().describe("Show popup to users"),
      popup_time_delay: z.number().int().min(0).optional().describe("Popup delay in seconds"),
      buy_button_max_width: z.number().int().min(100).max(2000).optional().describe("Buy button max width"),
      buy_button_position: z.enum(["above", "below"]).optional().describe("Buy button position"),
      buy_button_mode: z.enum(["smart", "always", "manual"]).optional().describe("Buy button display mode"),
      buy_button_background_color: z.string().optional().describe("Buy button background color"),
      buy_button_text_color: z.string().optional().describe("Buy button text color"),
      buy_button_outline_color: z.string().optional().describe("Buy button outline color"),
    },
    async (params) => {
      const result = await client.updateSettings(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "doomscrollr_get_zapier_templates",
    "Get available Zapier integration templates for connecting DOOMSCROLLR to 8,000+ apps.",
    {},
    async () => {
      // Return curated templates since this is static info
      const templates = {
        templates: [
          {
            name: "DOOMSCROLLR + Klaviyo",
            description: "New subscriber → Add to Klaviyo list → Trigger email flow",
            url: "https://zapier.com/apps/doomscrollr/integrations/klaviyo",
          },
          {
            name: "DOOMSCROLLR + Mailchimp",
            description: "New subscriber → Add to Mailchimp audience",
            url: "https://zapier.com/apps/doomscrollr/integrations/mailchimp",
          },
          {
            name: "DOOMSCROLLR + Shopify",
            description: "New subscriber → Create Shopify customer / Sync orders",
            url: "https://zapier.com/apps/doomscrollr/integrations/shopify",
          },
          {
            name: "DOOMSCROLLR + Instagram",
            description: "New IG post → Auto-create DOOMSCROLLR post",
            url: "https://zapier.com/apps/doomscrollr/integrations/instagram-for-business",
          },
          {
            name: "DOOMSCROLLR + ActiveCampaign",
            description: "New subscriber → Create contact → Trigger sequence",
            url: "https://zapier.com/apps/doomscrollr/integrations/activecampaign",
          },
          {
            name: "DOOMSCROLLR + Slack",
            description: "New subscriber → Send team notification",
            url: "https://zapier.com/apps/doomscrollr/integrations/slack",
          },
          {
            name: "DOOMSCROLLR + Airtable",
            description: "New subscriber → Log row with full UTM attribution",
            url: "https://zapier.com/apps/doomscrollr/integrations/airtable",
          },
        ],
        all_integrations: "https://zapier.com/apps/doomscrollr/integrations",
      };
      return { content: [{ type: "text", text: JSON.stringify(templates, null, 2) }] };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // RESOURCES
  // ═══════════════════════════════════════════════════════════

  server.resource(
    "profile",
    "doomscrollr://profile",
    { description: "Current DOOMSCROLLR profile and stats", mimeType: "application/json" },
    async (uri) => {
      const profile = await client.getProfile();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "posts",
    "doomscrollr://posts",
    { description: "Recent posts on this DOOMSCROLLR", mimeType: "application/json" },
    async (uri) => {
      const posts = await client.listPosts({ per_page: 20 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(posts, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "audience",
    "doomscrollr://audience",
    { description: "Recent audience members", mimeType: "application/json" },
    async (uri) => {
      const audience = await client.listAudience({ per_page: 20 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(audience, null, 2),
          },
        ],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // PROMPTS
  // ═══════════════════════════════════════════════════════════

  server.prompt(
    "setup-doomscrollr",
    "Set up a complete DOOMSCROLLR in under 45 seconds — account, domain, subscriber capture, first post.",
    {
      email: z.string().describe("Email for the new account"),
      username: z.string().describe("Desired username"),
      brand_name: z.string().optional().describe("Brand or project name"),
    },
    ({ email, username, brand_name }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Set up a new DOOMSCROLLR for ${brand_name || username}. Here's the plan:

1. Create the account with email: ${email}, username: ${username}
2. Search for available domains matching "${username}"
3. Get the embed code for subscriber capture
4. Update settings with the brand name${brand_name ? ` "${brand_name}"` : ""}
5. Show the user their URL and next steps

Use the doomscrollr_ tools to execute each step. The free tier includes everything needed to get started — custom domain, API access, subscriber capture, content feed, and commerce.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "add-audience-capture",
    "Add DOOMSCROLLR subscriber capture to an existing app or website.",
    {
      app_type: z.string().optional().describe("Type of app (e.g., 'Lovable', 'Next.js', 'Shopify')"),
    },
    ({ app_type }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help add DOOMSCROLLR subscriber capture to ${app_type ? `a ${app_type} app` : "an existing app/website"}.

1. Get the embed code using doomscrollr_get_embed_code
2. Explain how to paste it into the app
3. Show how to verify it's working
4. Suggest connecting Klaviyo or Mailchimp via Zapier for email automation

The embed is a single script tag — no framework dependencies, works everywhere.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "launch-product",
    "Launch a product drop to your owned DOOMSCROLLR audience.",
    {
      product_name: z.string().describe("Name of the product"),
      price: z.string().describe("Price (e.g., '29.99')"),
      type: z.string().optional().describe("Product type: physical, digital, ticket, or subscription"),
    },
    ({ product_name, price, type }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Launch "${product_name}" on DOOMSCROLLR:

1. Create the product with doomscrollr_create_product (price: $${price}, type: ${type || "digital"})
2. Create a link post announcing the product
3. Check subscriber count to estimate reach
4. Suggest a Zapier workflow for email notification on purchase

Every subscriber sees the post directly — no algorithm filtering.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "migrate-from-instagram",
    "Help someone reduce Instagram dependency by building an owned audience on DOOMSCROLLR.",
    {},
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Help the user migrate from Instagram to an owned audience:

1. Set up a DOOMSCROLLR (if they don't have one)
2. Get the embed code for their website/app
3. Suggest the Instagram → DOOMSCROLLR Zapier integration (auto cross-post)
4. Explain the strategy: link in bio → DOOMSCROLLR → owned subscriber list
5. Show how to connect Klaviyo/Mailchimp for email automation

Key message: Instagram followers are rented. DOOMSCROLLR subscribers are owned. One algorithm change can wipe out your reach — owned audience can't be taken away.`,
          },
        },
      ],
    })
  );

  return server;
}
