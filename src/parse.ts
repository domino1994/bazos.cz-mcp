import * as cheerio from "cheerio";

export interface Listing {
  id: string;
  title: string;
  url: string;
  price_text: string;
  price: number | null;
  locality: string;
  zip: string;
  views: number | null;
  description: string;
  image_url: string;
  topped: boolean;
  published: string;
}

export interface SearchPage {
  listings: Listing[];
  shown_from: number | null;
  shown_to: number | null;
  total: number | null;
}

const ORDER: Record<string, string> = {
  date: "",
  price_asc: "1",
  price_desc: "2",
  views: "3",
};

export function orderCode(sort: string | undefined): string {
  if (!sort || sort === "date") return "";
  const code = ORDER[sort];
  if (code === undefined) {
    throw new Error("Řazení musí být date, price_asc, price_desc nebo views.");
  }
  return code;
}

export function pageOffset(offset: number | undefined): number {
  const value = offset ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > 500 || value % 20 !== 0) {
    throw new Error("offset musí být násobek 20 mezi 0 a 500.");
  }
  return value;
}

export interface SearchQuery {
  query?: string;
  sectionSlug?: string;
  category?: string;
  zip?: string;
  radiusKm?: number;
  priceFrom?: number;
  priceTo?: number;
  sort?: string;
  offset?: number;
}

export function buildSearchUrl(input: SearchQuery): string {
  const offset = pageOffset(input.offset);
  const params = new URLSearchParams();
  params.set("hledat", input.query ?? "");
  params.set("hlokalita", input.zip ?? "");
  params.set("humkreis", String(input.radiusKm ?? 25));
  params.set("cenaod", input.priceFrom === undefined ? "" : String(input.priceFrom));
  params.set("cenado", input.priceTo === undefined ? "" : String(input.priceTo));
  params.set("order", orderCode(input.sort));
  params.set("Submit", "Hledat");
  params.set("kitx", "ano");

  if (!input.sectionSlug) {
    params.set("rubriky", "www");
    if (offset) params.set("crz", String(offset));
    return `https://www.bazos.cz/search.php?${params}`;
  }

  const category = (input.category ?? "").replace(/^\/+|\/+$/g, "");
  if (category) {
    const path = offset ? `/${category}/${offset}/` : `/${category}/`;
    return `https://${input.sectionSlug}.bazos.cz${path}?${params}`;
  }

  if (offset) {
    params.set("crp", String(offset));
    params.set("kitx", "ne");
  }
  return `https://${input.sectionSlug}.bazos.cz/?${params}`;
}

export function parseSearchHtml(html: string, pageUrl: string): SearchPage {
  const $ = cheerio.load(html);
  const listings: Listing[] = [];

  $(".inzeraty.inzeratyflex").each((_, element) => {
    const block = $(element);
    const link = block.find(".nadpis a").first();
    const href = link.attr("href");
    const title = link.text().replace(/\s+/g, " ").trim();
    if (!href || !title) return;

    const url = new URL(href, pageUrl).toString();
    const idMatch = url.match(/\/inzerat\/(\d+)\//);
    const priceText = block.find(".inzeratycena").text().replace(/\s+/g, " ").trim();
    const locationHtml = block.find(".inzeratylok").html() ?? "";
    const locationParts = locationHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const viewsText = block.find(".inzeratyview").text();
    const viewsMatch = viewsText.replace(/\s/g, "").match(/(\d+)/);
    const meta = block.find(".velikost10").first().text().replace(/\s+/g, " ").trim();
    const published = meta.match(/\[([^\]]+)\]/)?.[1]?.trim() ?? "";

    listings.push({
      id: idMatch?.[1] ?? "",
      title,
      url,
      price_text: priceText,
      price: parsePrice(priceText),
      locality: locationParts[0] ?? "",
      zip: locationParts[1] ?? "",
      views: viewsMatch ? Number(viewsMatch[1]) : null,
      description: block.find(".popis").text().replace(/\s+/g, " ").trim(),
      image_url: new URL(block.find("img.obrazek").attr("src") || "", pageUrl).toString(),
      topped: block.find(".ztop").length > 0,
      published,
    });
  });

  const summary = html.match(/Zobrazeno\s+(\d+)\s*-\s*(\d+)\s+inzerátů z\s+([\d\s\u00a0]+)/);
  return {
    listings,
    shown_from: summary ? Number(summary[1]) : null,
    shown_to: summary ? Number(summary[2]) : null,
    total: summary ? Number(summary[3].replace(/\s|\u00a0/g, "")) : null,
  };
}

export function parsePrice(priceText: string): number | null {
  const normalized = priceText.toLowerCase();
  if (normalized.includes("zdarma")) return 0;
  if (normalized.includes("dohod") || normalized.includes("v textu") || normalized.includes("nabíd")) {
    return null;
  }
  const digits = priceText.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export function pageNotice(html: string): string {
  const $ = cheerio.load(html);
  const orange = $(".oranzovy").text().replace(/\s+/g, " ").trim();
  if (orange) return orange.slice(0, 900);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, 500);
}

export interface HtmlForm {
  action: string;
  fields: Array<{ name: string; value: string }>;
}

export function parseEditableForm(html: string, pageUrl: string): HtmlForm | null {
  const $ = cheerio.load(html);
  const form = $("form")
    .filter((_, element) => {
      const node = $(element);
      return node.find("[name=nadpis], #popis, textarea[name=popis]").length > 0;
    })
    .first();
  if (!form.length) return null;

  const action = new URL(form.attr("action") || pageUrl, pageUrl).toString();
  const fields: Array<{ name: string; value: string }> = [];

  form.find("input, textarea, select").each((_, element) => {
    const node = $(element);
    const name = node.attr("name");
    if (!name) return;
    const type = (node.attr("type") || node.prop("tagName") || "").toString().toLowerCase();
    if (type === "file" || type === "submit" || type === "image" || type === "button") return;
    if ((type === "checkbox" || type === "radio") && node.attr("checked") === undefined) return;

    if (node.is("select")) {
      const selected = node.find("option[selected]").attr("value") ?? node.find("option").first().attr("value") ?? "";
      fields.push({ name, value: selected });
      return;
    }
    if (node.is("textarea")) {
      fields.push({ name, value: node.text() });
      return;
    }
    fields.push({ name, value: node.attr("value") ?? "" });
  });

  return { action, fields };
}

export function optionValueByLabel(html: string, selectName: string, labels: string[]): string | null {
  const $ = cheerio.load(html);
  const wanted = labels.map((label) => label.toLowerCase());
  let found: string | null = null;
  $(`select[name="${selectName}"] option`).each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (wanted.some((label) => text.includes(label))) {
      found = $(element).attr("value") ?? "";
      return false;
    }
    return undefined;
  });
  return found;
}

export function adIdFromUrl(url: string): string {
  const match = url.match(/\/inzerat\/(\d+)\//);
  if (!match) throw new Error(`V adrese inzerátu chybí číslo: ${url}`);
  return match[1];
}

export function normalizePhone(phone: string): string {
  const compact = phone.replace(/[\s-]/g, "");
  let value = compact;
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  else if (/^\d{9}$/.test(value)) value = `+420${value}`;
  else if (/^420\d{9}$/.test(value) || /^421\d{9}$/.test(value)) value = `+${value}`;
  if (!/^\+(420|421)\d{9}$/.test(value)) {
    throw new Error("Telefon musí být české nebo slovenské číslo, například +420777123456.");
  }
  return value;
}
