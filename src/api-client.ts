/**
 * DOOMSCROLLR API client — wraps the v1 REST API for MCP tool implementations.
 */

const DEFAULT_BASE_URL = "https://doomscrollr.com/api/v1";
const CLIENT_NAME = "@doomscrollr/mcp-server";
const CLIENT_VERSION = "1.0.20";

export class DoomscrollrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `${CLIENT_NAME}/${CLIENT_VERSION}`,
      "X-Doomscrollr-Client": CLIENT_NAME,
      "X-Doomscrollr-Client-Version": CLIENT_VERSION,
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        (data as Record<string, unknown>).error ||
        (data as Record<string, unknown>).message ||
        `HTTP ${res.status}`;
      throw new Error(String(msg));
    }

    return data as T;
  }

  private async textRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/csv, text/plain, application/json",
      "User-Agent": `${CLIENT_NAME}/${CLIENT_VERSION}`,
      "X-Doomscrollr-Client": CLIENT_NAME,
      "X-Doomscrollr-Client-Version": CLIENT_VERSION,
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }

    return text;
  }

  // ── Registration (no auth) ──────────────────────────────────
  async register(params: {
    email: string;
    username: string;
    password: string;
    name?: string;
  }) {
    // Use a temporary client without auth
    const url = `${this.baseUrl}/register`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": `${CLIENT_NAME}/${CLIENT_VERSION}`,
        "X-Doomscrollr-Client": CLIENT_NAME,
        "X-Doomscrollr-Client-Version": CLIENT_VERSION,
      },
      body: JSON.stringify(params),
    });
    return res.json();
  }

  // ── Hub ─────────────────────────────────────────────────────
  async getProfile() {
    return this.request("GET", "/profile");
  }

  // ── Settings ────────────────────────────────────────────────
  async getSettings() {
    return this.request("GET", "/settings");
  }

  async updateSettings(params: Record<string, unknown>) {
    return this.request("PATCH", "/settings", params);
  }

  // ── Posts ───────────────────────────────────────────────────
  async listPosts(params?: { per_page?: number; page?: number; q?: string; status?: string; tag?: string }) {
    const qs = new URLSearchParams();
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    if (params?.tag) qs.set("tag", params.tag);
    const query = qs.toString() ? `?${qs}` : "";
    return this.request("GET", `/posts${query}`);
  }

  async createLinkPost(params: {
    url: string;
    title?: string;
    description?: string;
    tags?: string;
    status?: string;
    publish_at?: string;
  }) {
    return this.request("POST", "/posts", params);
  }

  async createImagePost(params: {
    image: string;
    title?: string;
    description?: string;
    tags?: string;
    status?: string;
    publish_at?: string;
  }) {
    return this.request("POST", "/posts/image", params);
  }

  async showPost(id: number) {
    return this.request("GET", `/posts/${id}`);
  }

  async deletePost(id: number) {
    return this.request("DELETE", `/posts/${id}`);
  }

  async updatePost(id: number, params: Record<string, unknown>) {
    return this.request("PATCH", `/posts/${id}`, params);
  }

  async bulkUpdatePosts(params: Record<string, unknown>) {
    return this.request("PATCH", "/posts/bulk", params);
  }

  async bulkDeletePosts(ids: number[]) {
    return this.request("DELETE", "/posts/bulk", { ids });
  }

  // ── Audience ────────────────────────────────────────────────
  async listAudience(params?: { per_page?: number; page?: number; q?: string; tag?: string; bounced?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.q) qs.set("q", params.q);
    if (params?.tag) qs.set("tag", params.tag);
    if (typeof params?.bounced === "boolean") qs.set("bounced", String(params.bounced));
    const query = qs.toString() ? `?${qs}` : "";
    return this.request("GET", `/audience${query}`);
  }

  async exportAudience(params?: { q?: string; tag?: string; bounced?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.tag) qs.set("tag", params.tag);
    if (typeof params?.bounced === "boolean") qs.set("bounced", String(params.bounced));
    const query = qs.toString() ? `?${qs}` : "";
    return this.textRequest("GET", `/audience/export${query}`);
  }

  async addSubscriber(params: Record<string, unknown>) {
    return this.request("POST", "/audience", params);
  }

  async updateSubscriber(id: number, params: Record<string, unknown>) {
    return this.request("PATCH", `/audience/${id}`, params);
  }

  async showSubscriber(id: number) {
    return this.request("GET", `/audience/${id}`);
  }

  async removeSubscriber(id: number) {
    return this.request("DELETE", `/audience/${id}`);
  }

  async bulkUpdateSubscribers(params: Record<string, unknown>) {
    return this.request("PATCH", "/audience/bulk", params);
  }

  async bulkDeleteSubscribers(ids: number[]) {
    return this.request("DELETE", "/audience/bulk", { ids });
  }

  // ── Domain ──────────────────────────────────────────────────
  async searchDomains(name: string) {
    return this.request("POST", "/domain/search", { name });
  }

  async connectDomain(domain: string) {
    return this.request("POST", "/domain/connect", { domain });
  }

  async buyDomain(domain: string) {
    return this.request("POST", "/domain/buy", { domain });
  }

  async domainStatus() {
    return this.request("GET", "/domain/status");
  }

  async disconnectDomain(domain: string) {
    return this.request("DELETE", `/domain/${encodeURIComponent(domain)}`);
  }

  async getCurationTheme() {
    return this.request("GET", "/curation-theme");
  }

  async updateCurationTheme(theme: string | null) {
    return this.request("PUT", "/curation-theme", { theme });
  }

  async searchPinterest(params: { query: string; limit?: number }) {
    const qs = new URLSearchParams();
    qs.set("query", params.query);
    if (params.limit) qs.set("limit", String(params.limit));
    return this.request("GET", `/integrations/pinterest/search?${qs}`);
  }

  async searchPinterestAndPost(params: { query: string; limit?: number; status?: string; publish_at?: string; tags?: string }) {
    return this.request("POST", "/integrations/pinterest/search-post", params);
  }

  async connectPinterest(boardUrl: string) {
    return this.request("POST", "/integrations/pinterest/connect", { board_url: boardUrl });
  }

  async pinterestStatus() {
    return this.request("GET", "/integrations/pinterest/status");
  }

  async disconnectPinterest(integrationId?: number) {
    return this.request("DELETE", "/integrations/pinterest", integrationId ? { integration_id: integrationId } : {});
  }

  async connectInstagram() {
    return this.request("POST", "/integrations/instagram", {});
  }

  async connectRss(feedUrl: string) {
    return this.request("POST", "/integrations/rss", { feed_url: feedUrl });
  }

  async rssStatus() {
    return this.request("GET", "/integrations/rss/status");
  }

  async disconnectRss(integrationId?: number) {
    return this.request("DELETE", "/integrations/rss", integrationId ? { integration_id: integrationId } : {});
  }

  // ── Embed ───────────────────────────────────────────────────
  async getEmbedCode() {
    return this.request("GET", "/embed");
  }

  async topLikedPosts(params?: { limit?: number; days?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.days) qs.set("days", String(params.days));
    const query = qs.toString() ? `?${qs}` : "";
    return this.request("GET", `/analytics/top-liked-posts${query}`);
  }

  async createPage(params: { title: string; content: string; add_to_navigation?: boolean; navigation_label?: string }) {
    return this.request("POST", "/pages", params);
  }

  async createContactPage(params: { title?: string; intro?: string; links: Array<{ label: string; url: string }>; add_to_navigation?: boolean; navigation_label?: string }) {
    return this.request("POST", "/pages/contact", params);
  }

  async buildReplacementFlow(flow: string, params: Record<string, unknown>) {
    return this.request("POST", `/flows/${flow}`, params);
  }

  async postShopmyProducts(params: {
    products: Array<{ url: string; title?: string; description?: string; note?: string }>;
    collection_title?: string;
    use_case?: string;
    tags?: string;
    status?: string;
    publish_at?: string;
  }) {
    return this.request("POST", "/affiliate/shopmy/posts", params);
  }

  // ── Products ────────────────────────────────────────────────
  async listProducts(params?: { per_page?: number; page?: number; q?: string; type?: string; min_price?: number; max_price?: number }) {
    const qs = new URLSearchParams();
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.q) qs.set("q", params.q);
    if (params?.type) qs.set("type", params.type);
    if (typeof params?.min_price === "number") qs.set("min_price", String(params.min_price));
    if (typeof params?.max_price === "number") qs.set("max_price", String(params.max_price));
    const query = qs.toString() ? `?${qs}` : "";
    return this.request("GET", `/products${query}`);
  }

  async createProduct(params: {
    title: string;
    description?: string;
    price: number;
    type: string;
    cover_photo_url?: string;
    url?: string;
    inventory_count?: number;
    shipping_required?: boolean;
    shipping_cost?: number;
    sku?: string;
    variant_options?: Array<{ name: string; values: string[] }>;
    variants?: Array<{ variant_data: Record<string, string>; price: number; inventory_count: number; sku?: string }>;
  }) {
    return this.request("POST", "/products", params);
  }

  async updateProduct(id: number, params: Record<string, unknown>) {
    return this.request("PATCH", `/products/${id}`, params);
  }

  async showProduct(id: number) {
    return this.request("GET", `/products/${id}`);
  }

  async deleteProduct(id: number) {
    return this.request("DELETE", `/products/${id}`);
  }

  async bulkUpdateProducts(params: Record<string, unknown>) {
    return this.request("PATCH", "/products/bulk", params);
  }

  async bulkDeleteProducts(ids: number[]) {
    return this.request("DELETE", "/products/bulk", { ids });
  }

  // ── Capture ─────────────────────────────────────────────────
  async getCaptureSettings() {
    return this.request("GET", "/capture");
  }

  async updateCapture(params: Record<string, unknown>) {
    return this.request("PATCH", "/capture", params);
  }
}
