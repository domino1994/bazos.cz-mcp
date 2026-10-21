import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  adIdFromUrl,
  buildSearchUrl,
  normalizePhone,
  optionValueByLabel,
  pageNotice,
  parseEditableForm,
  parseSearchHtml,
  type Listing,
  type SearchPage,
} from "./parse.js";
import { resolveSection, sectionOrigin, SECTIONS, type Section } from "./sections.js";
import { SessionStore } from "./session.js";

const USER_AGENT = "bazos-mcp/0.1 (osobni sprava inzeratu)";

export interface SearchInput {
  query?: string;
  section?: string;
  category?: string;
  zip?: string;
  radius_km?: number;
  price_from?: number;
  price_to?: number;
  sort?: string;
  offset?: number;
}

export interface CreateAdInput {
  section: string;
  category_id: string;
  title: string;
  description: string;
  price?: number;
  price_kind?: "kc" | "dohodou" | "v_textu" | "zdarma" | "nabidnete";
  zip: string;
  name: string;
  phone: string;
  email: string;
  password: string;
  image_paths?: string[];
}

export interface UpdateAdInput {
  url?: string;
  section?: string;
  ad_id?: string;
  password: string;
  title?: string;
  description?: string;
  price?: number;
  price_kind?: CreateAdInput["price_kind"];
  zip?: string;
  name?: string;
  phone?: string;
  email?: string;
  image_paths?: string[];
}

const PRICE_LABELS: Record<NonNullable<CreateAdInput["price_kind"]>, string[]> = {
  kc: ["kč", "kc"],
  dohodou: ["dohodou"],
  v_textu: ["v textu"],
  zdarma: ["zdarma"],
  nabidnete: ["nabídněte", "nabidnete"],
};

export class BazosClient {
  private readonly session: SessionStore;

  constructor(session: SessionStore) {
    this.session = session;
  }

  async search(input: SearchInput): Promise<SearchPage & { url: string }> {
    const section = input.section ? resolveSection(input.section) : undefined;
    const url = buildSearchUrl({
      query: input.query,
      sectionSlug: section?.slug,
      category: input.category,
      zip: input.zip,
      radiusKm: input.radius_km,
      priceFrom: input.price_from,
      priceTo: input.price_to,
      sort: input.sort,
      offset: input.offset,
    });
    await this.ensureSiteCookie(url);
    const html = await this.get(url);
    await this.session.save();
    return { url, ...parseSearchHtml(html, url) };
  }

  async getAd(adIdOrUrl: string): Promise<unknown> {
    const id = adIdOrUrl.includes("inzerat") ? adIdFromUrl(adIdOrUrl) : adIdOrUrl.trim();
    if (!/^\d+$/.test(id)) throw new Error("ad_id musí být číslo inzerátu nebo jeho URL.");
    const url = `https://www.bazos.cz/api/v1/ad-detail-2.php?ad_id=${encodeURIComponent(id)}&edit=false`;
    return this.getJson(url);
  }

  async listSections(): Promise<Section[]> {
    try {
      const live = await this.getJson<Array<{ id: string; title: string; url: string }>>(
        "https://www.bazos.cz/api/v1/sections.php",
      );
      return live.map((section) => ({
        id: section.id,
        slug: section.url,
        title: section.title,
      }));
    } catch {
      return SECTIONS;
    }
  }

  async listCategories(sectionValue: string): Promise<unknown> {
    const section = resolveSection(sectionValue);
    return this.getJson(`https://www.bazos.cz/api/v1/categories.php?section=${encodeURIComponent(section.id)}`);
  }

  async getRatings(input: { phone_id?: string; email_id?: string; offset?: number }): Promise<unknown> {
    if (!input.phone_id && !input.email_id) {
      throw new Error("Zadej phone_id nebo email_id z detailu inzerátu.");
    }
    const offset = input.offset ?? 0;
    if (offset % 20 !== 0) throw new Error("offset musí být násobek 20.");
    const params = new URLSearchParams({
      offset: String(offset),
      limit: "20",
      phone: input.phone_id ?? "",
      email: input.email_id ?? "",
    });
    return this.getJson(`https://www.bazos.cz/api/v1/ratings.php?${params}`);
  }

  async listSellerAds(input: { phone_id?: string; email_id?: string; offset?: number }): Promise<unknown> {
    if (!input.phone_id && !input.email_id) {
      throw new Error("Zadej phone_id nebo email_id z detailu inzerátu.");
    }
    const offset = input.offset ?? 0;
    if (offset % 20 !== 0 || offset > 200) throw new Error("offset musí být násobek 20, nejvýše 200.");
    const params = new URLSearchParams({
      offset: String(offset),
      limit: "20",
      phone: input.phone_id ?? "",
      email: input.email_id ?? "",
    });
    return this.getJson(`https://www.bazos.cz/api/v1/ads.php?${params}`);
  }

  async requestPhoneCode(phone: string): Promise<Record<string, unknown>> {
    const normalized = normalizePhone(phone);
    const endpoint = "https://www.bazos.cz/moje-inzeraty.php";
    await this.get(endpoint);
    const html = await this.post(endpoint, {
      podminky: "1",
      teloverit: normalized,
      Submit: "Odeslat",
    });
    this.session.phone = normalized;
    await this.session.save();
    return {
      ...this.authState(html),
      phone: normalized,
      message: pageNotice(html),
    };
  }

  async confirmPhoneCode(code: string, phone?: string): Promise<Record<string, unknown>> {
    const normalized = normalizePhone(phone || this.session.phone || "");
    const endpoint = "https://www.bazos.cz/moje-inzeraty.php";
    await this.get(endpoint);
    const html = await this.post(endpoint, {
      klic: code.trim(),
      klictelefon: normalized,
      Submit: "Odeslat",
    });
    this.session.phone = normalized;
    await this.session.save();
    const state = this.authState(html);
    return {
      ...state,
      phone: normalized,
      message: pageNotice(html),
    };
  }

  async listMyAds(input: { email: string; phone: string }): Promise<{ listings: Listing[]; message: string; needs_verification: boolean }> {
    const endpoint = "https://www.bazos.cz/moje-inzeraty.php";
    await this.get(endpoint);
    const html = await this.post(endpoint, {
      mail: input.email.trim(),
      telefon: input.phone.replace(/[\s-]/g, "").replace(/^\+/, ""),
      Submit: "Vypsat inzeráty",
    });
    await this.session.save();
    const parsed = parseSearchHtml(html, endpoint);
    const needsVerification = html.includes('name="teloverit"') && parsed.listings.length === 0;
    return {
      listings: parsed.listings,
      needs_verification: needsVerification,
      message: needsVerification ? pageNotice(html) : `Nalezeno ${parsed.listings.length} inzerátů na této stránce.`,
    };
  }

  async createAd(input: CreateAdInput): Promise<Record<string, unknown>> {
    this.requireSession();
    const section = resolveSection(input.section);
    const origin = sectionOrigin(section);
    const pageUrl = `${origin}/pridat-inzerat.php`;
    const html = await this.get(pageUrl);
    if (html.includes('name="teloverit"') && !html.includes('name="nadpis"')) {
      return {
        ok: false,
        needs_verification: true,
        message: pageNotice(html),
      };
    }

    const uploaded = await this.uploadImages(origin, input.image_paths ?? []);
    const priceKind = input.price_kind ?? "kc";
    const priceValue = optionValueByLabel(html, "cenavyber", PRICE_LABELS[priceKind]);
    const body: Record<string, string | string[]> = {
      category: input.category_id,
      nadpis: input.title,
      popis: input.description,
      cena: input.price === undefined || priceKind !== "kc" ? "" : String(input.price),
      cenavyber: priceValue ?? (priceKind === "kc" ? "1" : ""),
      lokalita: input.zip,
      jmeno: input.name,
      telefoni: input.phone,
      maili: input.email,
      heslobazar: input.password,
      Submit: "Odeslat",
    };
    if (uploaded.length) body["files[]"] = uploaded;

    const form = parseEditableForm(html, pageUrl);
    if (form) {
      for (const field of form.fields) {
        if (field.name in body || field.name === "files[]") continue;
        body[field.name] = field.value;
      }
    }

    const action = form?.action ?? `${origin}/insert.php`;
    const resultHtml = await this.postForm(action, body);
    await this.session.save();
    const message = pageNotice(resultHtml);
    return {
      ok: /inzerát byl vložen/i.test(message),
      ad_id: resultHtml.match(/\/inzerat\/(\d+)\//)?.[1] ?? null,
      message,
    };
  }

  async updateAd(input: UpdateAdInput): Promise<Record<string, unknown>> {
    const target = this.adTarget(input);
    const html = await this.post(`${target.origin}/deletei2.php`, {
      idad: target.id,
      heslobazar: input.password,
      administrace: "Upravit",
    });
    const editNotice = pageNotice(html);
    if (/špatné heslo/i.test(editNotice)) {
      return { ok: false, message: "Bazoš heslo inzerátu odmítl." };
    }
    const form = parseEditableForm(html, `${target.origin}/deletei2.php`);
    if (!form) {
      return { ok: false, message: pageNotice(html) };
    }

    const fields = new Map<string, string[]>();
    for (const field of form.fields) {
      const current = fields.get(field.name) ?? [];
      current.push(field.value);
      fields.set(field.name, current);
    }
    const set = (name: string, value: string | undefined) => {
      if (value !== undefined) fields.set(name, [value]);
    };
    set("nadpis", input.title);
    set("popis", input.description);
    set("lokalita", input.zip);
    set("jmeno", input.name);
    set("telefoni", input.phone);
    set("maili", input.email);
    set("heslobazar", input.password);
    if (input.price !== undefined) set("cena", String(input.price));
    if (input.price_kind) {
      const value = optionValueByLabel(html, "cenavyber", PRICE_LABELS[input.price_kind]);
      if (value !== null) set("cenavyber", value);
    }
    if (input.image_paths?.length) {
      const uploaded = await this.uploadImages(target.origin, input.image_paths);
      fields.set("files[]", uploaded);
    }

    const resultHtml = await this.postForm(form.action, fields);
    const message = pageNotice(resultHtml);
    return { ok: /byl uložen|byl upraven|byl změněn/i.test(message), ad_id: target.id, message };
  }

  async deleteAd(input: { url?: string; section?: string; ad_id?: string; password: string }): Promise<Record<string, unknown>> {
    const target = this.adTarget(input);
    const html = await this.post(`${target.origin}/deletei2.php`, {
      idad: target.id,
      heslobazar: input.password,
      administrace: "Vymazat",
    });
    const message = pageNotice(html);
    const wrongPassword = /špatné heslo/i.test(message);
    return {
      ok: /byl vymazán/i.test(message),
      ad_id: target.id,
      message: wrongPassword ? "Bazoš heslo inzerátu odmítl." : message,
    };
  }

  private async ensureSiteCookie(url: string): Promise<void> {
    if (this.session.cookies.has("rekkk")) return;
    const origin = new URL(url).origin;
    await this.get(`${origin}/`);
  }

  private requireSession(): void {
    if (!this.session.cookies.has("bid") || !this.session.cookies.has("bkod")) {
      throw new Error("Chybí ověřená session. Nejdřív zavolej request_phone_code a confirm_phone_code.");
    }
  }

  private authState(html: string) {
    return {
      code_requested: html.includes('name="klic"') || html.toLowerCase().includes("mobilní klíč"),
      invalid_code: html.includes("Chybně zadaný mobilní klíč"),
      authenticated: this.session.cookies.has("bid") && this.session.cookies.has("bkod"),
      has_bid: this.session.cookies.has("bid"),
      has_bkod: this.session.cookies.has("bkod"),
    };
  }

  private adTarget(input: { url?: string; section?: string; ad_id?: string }): { origin: string; id: string } {
    if (input.url) {
      const url = new URL(input.url);
      return { origin: `${url.protocol}//${url.host}`, id: adIdFromUrl(input.url) };
    }
    if (!input.section || !input.ad_id) {
      throw new Error("Zadej url inzerátu, nebo section a ad_id.");
    }
    return { origin: sectionOrigin(resolveSection(input.section)), id: input.ad_id };
  }

  private async uploadImages(origin: string, imagePaths: string[]): Promise<string[]> {
    const names: string[] = [];
    for (const imagePath of imagePaths) {
      const bytes = await readFile(imagePath);
      const filename = path.basename(imagePath);
      const form = new FormData();
      form.append("file[]", new Blob([new Uint8Array(bytes)]), filename);
      const response = await this.fetch(`${origin}/upload.php`, { method: "POST", body: form });
      const text = (await response.text()).trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`Nahrání fotky ${filename} selhalo: ${text.slice(0, 240)}`);
      }
      if (!Array.isArray(parsed) || typeof parsed[0] !== "string") {
        throw new Error(`Bazoš fotku ${filename} nevzal: ${text.slice(0, 240)}`);
      }
      names.push(parsed[0]);
    }
    return names;
  }

  private async get(url: string): Promise<string> {
    const response = await this.fetch(url);
    return response.text();
  }

  private async getJson<T = unknown>(url: string): Promise<T> {
    const response = await this.fetch(url, {
      headers: { accept: "application/json" },
    });
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Bazoš nevrátil JSON (${response.status}): ${text.slice(0, 180)}`);
    }
  }

  private async post(url: string, fields: Record<string, string>): Promise<string> {
    const body = new URLSearchParams(fields);
    const response = await this.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    await this.session.save();
    return response.text();
  }

  private async postForm(url: string, fields: Map<string, string[]> | Record<string, string | string[]>): Promise<string> {
    const form = new FormData();
    const entries = fields instanceof Map ? [...fields.entries()] : Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value : [value]] as const);
    for (const [name, values] of entries) {
      for (const value of values) form.append(name, value);
    }
    const response = await this.fetch(url, { method: "POST", body: form });
    await this.session.save();
    return response.text();
  }

  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("user-agent", USER_AGENT);
    headers.set("accept-language", "cs");
    const cookie = this.session.header();
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    this.session.absorb(response);
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Bazoš vrátil HTTP ${response.status} pro ${url}: ${text.slice(0, 180)}`);
    }
    return response;
  }
}
