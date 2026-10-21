import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchUrl, normalizePhone, optionValueByLabel, parseEditableForm, parseSearchHtml } from "./parse.ts";

const html = `
<div class="inzeraty inzeratyflex">
  <div class="inzeratynadpis">
    <a href="/inzerat/225206342/lenovo.php"><img class="obrazek" src="https://www.bazos.cz/img/1.jpg"></a>
    <h2 class=nadpis><a href="/inzerat/225206342/lenovo.php">Thinkpad Z13</a></h2>
    <span class=velikost10> - <span class="ztop">TOP</span> - [21.10. 2026]</span>
    <div class=popis>Prémiový notebook</div>
  </div>
  <div class="inzeratycena"><b><span>  18 700 Kč</span></b></div>
  <div class="inzeratylok">Brno<br>621 00</div>
  <div class="inzeratyview">654 x</div>
</div>
<div class="inzeraty inzeratyflex">
  <div class="inzeratynadpis">
    <h2 class=nadpis><a href="/inzerat/9/zdarma.php">Kabel</a></h2>
  </div>
  <div class="inzeratycena"><b>Zdarma</b></div>
  <div class="inzeratylok">Praha<br>110 00</div>
  <div class="inzeratyview">3 x</div>
</div>
Zobrazeno 21-40 inzerátů z 1 551
`;

test("parseSearchHtml reads listing, price, place and total", () => {
  const page = parseSearchHtml(html, "https://pc.bazos.cz/notebook/");
  assert.equal(page.listings.length, 2);
  assert.equal(page.listings[0]?.id, "225206342");
  assert.equal(page.listings[0]?.title, "Thinkpad Z13");
  assert.equal(page.listings[0]?.price, 18700);
  assert.equal(page.listings[0]?.locality, "Brno");
  assert.equal(page.listings[0]?.zip, "621 00");
  assert.equal(page.listings[0]?.views, 654);
  assert.equal(page.listings[0]?.topped, true);
  assert.equal(page.listings[0]?.published, "21.10. 2026");
  assert.equal(page.listings[0]?.url, "https://pc.bazos.cz/inzerat/225206342/lenovo.php");
  assert.equal(page.listings[1]?.price, 0);
  assert.equal(page.total, 1551);
  assert.equal(page.shown_from, 21);
  assert.equal(page.shown_to, 40);
});

test("buildSearchUrl encodes section, category, price and page", () => {
  assert.equal(
    buildSearchUrl({
      query: "thinkpad",
      sectionSlug: "pc",
      category: "notebook",
      zip: "62100",
      radiusKm: 30,
      priceFrom: 1000,
      priceTo: 15000,
      sort: "price_asc",
      offset: 20,
    }),
    "https://pc.bazos.cz/notebook/20/?hledat=thinkpad&hlokalita=62100&humkreis=30&cenaod=1000&cenado=15000&order=1&Submit=Hledat&kitx=ano",
  );
  assert.match(buildSearchUrl({ query: "kolo", offset: 40 }), /search\.php\?.*crz=40/);
  assert.match(buildSearchUrl({ query: "disk", sectionSlug: "pc", offset: 20 }), /crp=20/);
});

test("parseSearchHtml reads my-ads titles that use span.nadpis", () => {
  const mine = `
    <div class="inzeraty inzeratyflex">
      <div class="inzeratynadpis">
        <span class=nadpis><a href="https://pc.bazos.cz/inzerat/42/kabel.php">Kabel</a></span>
        <span class=velikost10> - [1.9. 2026]</span>
        <div class=popis>Krátký</div>
      </div>
      <div class="inzeratycena"><b><span>  120 Kč</span></b></div>
      <div class="inzeratylok">Olomouc<br>779 00</div>
      <div class="inzeratyview">8 x</div>
    </div>`;
  const page = parseSearchHtml(mine, "https://www.bazos.cz/moje-inzeraty.php");
  assert.equal(page.listings[0]?.title, "Kabel");
  assert.equal(page.listings[0]?.price, 120);
  assert.equal(page.listings[0]?.url, "https://pc.bazos.cz/inzerat/42/kabel.php");
});

test("normalizePhone accepts local Czech numbers", () => {
  assert.equal(normalizePhone("777 123 456"), "+420777123456");
  assert.equal(normalizePhone("+421901234567"), "+421901234567");
  assert.throws(() => normalizePhone("123"), /české nebo slovenské/);
});

test("parseEditableForm keeps fields after a div that would close the form in a browser parser", () => {
  const formHtml = `
    <form name="formpridani" action="/insert.php">
      <input name="nadpis" value="Starý">
      </div>
      <input name="jmeno" value="Dominik">
      <input type="hidden" name="idad" value=225345720>
    </form>`;
  const form = parseEditableForm(formHtml, "https://auto.bazos.cz/deletei2.php");
  assert.equal(form?.fields.find((field) => field.name === "jmeno")?.value, "Dominik");
  assert.equal(form?.fields.find((field) => field.name === "idad")?.value, "225345720");
});

test("parseEditableForm keeps hidden fields and selected price", () => {
  const formHtml = `
    <form action="/insert.php" method="post">
      <input type="hidden" name="token" value="abc">
      <input name="nadpis" value="Starý">
      <textarea name="popis">Text</textarea>
      <select name="cenavyber"><option value="1">Kč</option><option value="3" selected>Dohodou</option></select>
      <input type="checkbox" name="podminky" value="1" checked>
      <input type="submit" name="Submit" value="Odeslat">
    </form>`;
  const form = parseEditableForm(formHtml, "https://pc.bazos.cz/pridat-inzerat.php");
  assert.ok(form);
  assert.equal(form?.action, "https://pc.bazos.cz/insert.php");
  assert.deepEqual(
    form?.fields.map((field) => [field.name, field.value]),
    [
      ["token", "abc"],
      ["nadpis", "Starý"],
      ["podminky", "1"],
      ["popis", "Text"],
      ["cenavyber", "3"],
    ],
  );
  assert.equal(optionValueByLabel(formHtml, "cenavyber", ["dohodou"]), "3");
});
