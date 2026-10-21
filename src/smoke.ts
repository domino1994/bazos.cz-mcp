import assert from "node:assert/strict";
import { BazosClient } from "./client.js";
import { SessionStore } from "./session.js";

const session = new SessionStore("/tmp/bazos-mcp-smoke-session.json");
const client = new BazosClient(session);

const page = await client.search({
  query: "thinkpad",
  section: "pc",
  category: "notebook",
  zip: "62100",
  radius_km: 30,
  price_from: 1000,
  price_to: 20000,
  sort: "price_asc",
});

assert.ok(page.listings.length > 0, "search returned no listings");
assert.ok(page.total && page.total > 0, "missing total");
assert.ok(page.listings.every((listing) => listing.price === null || listing.price <= 20000));
assert.match(page.listings[0]?.url ?? "", /^https:\/\/pc\.bazos\.cz\/inzerat\/\d+\//);

const detail = await client.getAd(page.listings[0]!.id);
assert.equal(typeof detail, "object");
assert.equal((detail as { id: string }).id, page.listings[0]?.id);

const categories = await client.listCategories("PC");
assert.ok(Array.isArray(categories) && categories.length > 5);

const mine = await client.listMyAds({ email: "nikdo@example.com", phone: "777000111" });
assert.equal(mine.needs_verification, true);

const removed = await client.deleteAd({
  section: "pc",
  ad_id: page.listings[0]!.id,
  password: "urcite-spatne-heslo",
});
assert.equal(removed.ok, false);
assert.match(String(removed.message), /heslo/i);

const stillThere = await client.getAd(page.listings[0]!.id);
assert.equal((stillThere as { status?: string }).status, "active");

console.error(`smoke ok: ${page.listings.length} listings, total ${page.total}, delete rejected, ad still active`);
