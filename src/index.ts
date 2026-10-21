#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BazosClient } from "./client.js";
import { defaultSessionPath, SessionStore } from "./session.js";

const session = new SessionStore(defaultSessionPath());
await session.load();
const bazos = new BazosClient(session);

const server = new McpServer({
  name: "bazos",
  version: "0.1.0",
});

const sortSchema = z.enum(["date", "price_asc", "price_desc", "views"]).optional().describe("Řazení. Výchozí je datum.");
const priceKind = z.enum(["kc", "dohodou", "v_textu", "zdarma", "nabidnete"]).optional();

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "search_ads",
  {
    title: "Hledat inzeráty",
    description:
      "Vyhledá veřejné inzeráty na Bazos.cz. Umí dotaz, rubriku, kategorii (slug z list_categories, třeba notebook), PSČ, okolí v km, cenu a řazení. Vrací jednu stránku po 20.",
    inputSchema: {
      query: z.string().optional().describe("Hledaný výraz."),
      section: z.string().optional().describe("Rubrika: kód PC nebo slug pc. Prázdné = všechny rubriky."),
      category: z.string().optional().describe("Slug kategorie v rubrice, například notebook nebo graficka."),
      zip: z.string().optional().describe("PSČ lokality, například 62100."),
      radius_km: z.number().optional().describe("Okolí v kilometrech. Výchozí 25."),
      price_from: z.number().optional().describe("Cena od v Kč."),
      price_to: z.number().optional().describe("Cena do v Kč."),
      sort: sortSchema,
      offset: z.number().int().optional().describe("Stránkování, násobek 20. Výchozí 0."),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.search(input));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "get_ad",
  {
    title: "Detail inzerátu",
    description: "Vrátí detail veřejného inzerátu podle čísla nebo URL. Telefon prodejce zůstane maskovaný, jak ho vrací Bazoš.",
    inputSchema: {
      ad_id: z.string().describe("Číslo inzerátu nebo jeho URL."),
    },
  },
  async ({ ad_id }) => {
    try {
      return ok(await bazos.getAd(ad_id));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "list_sections",
  {
    title: "Seznam rubrik",
    description: "Vypíše hlavní rubriky Bazos.cz (Auto, PC, …) včetně kódu a slugu.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await bazos.listSections());
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "list_categories",
  {
    title: "Kategorie rubriky",
    description: "Vypíše kategorie jedné rubriky. category id se používá při vytváření inzerátu, url slug při hledání.",
    inputSchema: {
      section: z.string().describe("Rubrika, například PC nebo pc."),
    },
  },
  async ({ section }) => {
    try {
      return ok(await bazos.listCategories(section));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "list_seller_ads",
  {
    title: "Inzeráty prodejce",
    description: "Veřejné inzeráty prodejce podle phone_id a email_id z detailu inzerátu. Nejsou to telefonní číslo ani e-mail.",
    inputSchema: {
      phone_id: z.string().optional(),
      email_id: z.string().optional(),
      offset: z.number().int().optional(),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.listSellerAds(input));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "get_user_ratings",
  {
    title: "Hodnocení prodejce",
    description: "Veřejné hodnocení prodejce podle phone_id a email_id z detailu inzerátu.",
    inputSchema: {
      phone_id: z.string().optional(),
      email_id: z.string().optional(),
      offset: z.number().int().optional(),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.getRatings(input));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "request_phone_code",
  {
    title: "Poslat SMS klíč",
    description:
      "Požádá Bazos.cz o ověřovací SMS na české nebo slovenské číslo. Číslo se nezveřejní. Volat jen když uživatel chce ověřit vlastní telefon. Kód pak potvrď přes confirm_phone_code.",
    inputSchema: {
      phone: z.string().describe("Telefon, například +420777123456 nebo 777123456."),
    },
  },
  async ({ phone }) => {
    try {
      return ok(await bazos.requestPhoneCode(phone));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "confirm_phone_code",
  {
    title: "Potvrdit SMS klíč",
    description: "Dokončí ověření telefonu kódem z SMS a uloží session do ~/.config/bazos-mcp/session.json.",
    inputSchema: {
      code: z.string().describe("Mobilní klíč z SMS."),
      phone: z.string().optional().describe("Telefon, pokud se liší od posledního request_phone_code."),
    },
  },
  async ({ code, phone }) => {
    try {
      return ok(await bazos.confirmPhoneCode(code, phone));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "session_status",
  {
    title: "Stav přihlášení",
    description: "Řekne, jestli je uložená ověřená session. Hodnoty cookies nevrací.",
    inputSchema: {},
  },
  async () => ok(session.status()),
);

server.registerTool(
  "clear_session",
  {
    title: "Zapomenout session",
    description: "Smaže uložené cookies ověření telefonu z disku.",
    inputSchema: {},
  },
  async () => {
    await session.clear();
    return ok({ cleared: true });
  },
);

server.registerTool(
  "list_my_ads",
  {
    title: "Moje inzeráty",
    description:
      "Vypíše inzeráty podle e-mailu a telefonu uvedeného v inzerátu. Bazoš předtím vyžaduje ověřený telefon (request_phone_code a confirm_phone_code).",
    inputSchema: {
      email: z.string().describe("E-mail uvedený v inzerátech."),
      phone: z.string().describe("Telefon uvedený v inzerátech."),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.listMyAds(input));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "create_ad",
  {
    title: "Vložit inzerát",
    description:
      "Vloží nový inzerát do zvolené rubriky. Vyžaduje ověřenou session. Před prvním inzerátem může Bazoš chtít propojení telefonu s účtem platbou 1 Kč — to se dělá na webu, tenhle nástroj to neudělá. Fotky jsou cesty k souborům na počítači, kde server běží.",
    inputSchema: {
      section: z.string().describe("Rubrika, například PC."),
      category_id: z.string().describe("Číselné id kategorie z list_categories."),
      title: z.string(),
      description: z.string(),
      price: z.number().optional().describe("Cena v Kč, když je price_kind kc."),
      price_kind: priceKind.describe("kc, dohodou, v_textu, zdarma nebo nabidnete. Výchozí kc."),
      zip: z.string().describe("PSČ."),
      name: z.string(),
      phone: z.string().describe("Telefon zobrazený v inzerátu."),
      email: z.string(),
      password: z.string().describe("Heslo pro pozdější úpravu a smazání. Neukládá se."),
      image_paths: z.array(z.string()).optional(),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.createAd(input));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "update_ad",
  {
    title: "Upravit inzerát",
    description: "Otevře úpravu inzerátu heslem, které bylo zadáno při vložení, a odešle změněné údaje. Zadej url, nebo section a ad_id.",
    inputSchema: {
      url: z.string().optional(),
      section: z.string().optional(),
      ad_id: z.string().optional(),
      password: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      price: z.number().optional(),
      price_kind: priceKind,
      zip: z.string().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      image_paths: z.array(z.string()).optional(),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.updateAd(input));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "delete_ad",
  {
    title: "Smazat inzerát",
    description: "Smaže vlastní inzerát heslem zadaným při vložení. Zadej url, nebo section a ad_id.",
    inputSchema: {
      url: z.string().optional(),
      section: z.string().optional(),
      ad_id: z.string().optional(),
      password: z.string(),
    },
  },
  async (input) => {
    try {
      return ok(await bazos.deleteAd(input));
    } catch (error) {
      return fail(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
