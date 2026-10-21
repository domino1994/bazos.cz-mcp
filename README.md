# Bazos MCP

MCP server, přes který asistent v Cursoru, Claude Desktopu nebo jiném MCP klientovi čte a spravuje inzeráty na [Bazos.cz](https://www.bazos.cz/). Místo klikání ve formulářích stačí napsat, co hledáš, nebo co chceš vložit, upravit a smazat.

Není to oficiální API Bazoše a s Bazošem to nemá nic společného. Server posílá stejné stránky a formuláře jako prohlížeč. Když Bazoš web změní, něco se může rozbít.

English summary is [below](#english).

## K čemu to je dobré

- Najít inzerát podle výrazu, rubriky, kategorie, PSČ, okolí a ceny. Třeba notebook do 15 tisíc v okolí Brna, seřazený od nejlevnějšího.
- Otevřít detail, podívat se na další inzeráty stejného prodejce a na jeho veřejné hodnocení.
- Nechat asistenta hlídat, co je v inzerci, a srovnat pár nabídek, aniž bys procházel stránky ručně.
- Vypsat, vložit, upravit nebo smazat **vlastní** inzeráty. Heslo k inzerátu se nikam neukládá, předává se jen v tom jednom požadavku.
- Napojit Bazoš na agenta, který už umí psát texty, třídit fotky nebo hlídat cenu. Tenhle server je jen most k webu.

Hledání a čtení veřejných inzerátů jde bez přihlášení. Vkládání a správa vlastních inzerátů až po ověření českého nebo slovenského telefonu SMS kódem. Před úplně prvním inzerátem může Bazoš chtít ještě propojení telefonu s účtem platbou 1 Kč. To se dělá na webu, tenhle nástroj to neudělá.

## Jak to zapojit

Potřebuješ Node.js 20 nebo novější.

```bash
git clone https://github.com/domino1994/bazos.cz-mcp.git
cd bazos.cz-mcp
npm install
npm run build
```

Do MCP klienta patří příkaz `node` a absolutní cesta k `dist/index.js`. U Cursora je to `~/.cursor/mcp.json` (nebo `.cursor/mcp.json` v projektu), u Claude Desktopu konfigurační soubor MCP serverů:

```json
{
  "mcpServers": {
    "bazos": {
      "command": "node",
      "args": ["/absolutni/cesta/k/bazos/dist/index.js"]
    }
  }
}
```

Po uložení klienta restartuj, ať server naběhne. Od té chvíle stačí psát normálně. Asistent si nástroje vybírá sám.

Příklady:

- „Najdi na Bazoši ThinkPady v rubrice PC, kategorie notebook, do 20 tisíc, PSČ 62100, okolí 30 km, od nejlevnějšího.“
- „Otevři tenhle inzerát a ukaž hodnocení prodejce.“
- „Vypiš moje inzeráty na mail@example.com a telefonu 777123456.“
- „Vlož inzerát do PC / notebook: nadpis, popis, cena 8 000 Kč, PSČ, jméno, telefon, e-mail. Heslo ti řeknu já. Fotky v tomhle pořadí: /Users/domino/fotky/notebook/01.jpg, /Users/domino/fotky/notebook/02.jpg.“

`category_id` pro nový inzerát je číselné `id` z `list_categories`. Při hledání se kategorie zadává slugem z pole `url`, třeba `notebook`.

## Vlastní inzeráty

1. Řekni asistentovi, ať pošle ověřovací SMS na **tvůj** telefon `+420…` nebo `+421…` (`request_phone_code`).
2. Pošli mu kód z SMS (`confirm_phone_code`).
3. Pak jde `list_my_ads`, `create_ad`, `update_ad` a `delete_ad`.

Cookies ověření (`bid`, `bkod`) se ukládají do `~/.config/bazos-mcp/session.json` s právy `0600`. Cestu změníš proměnnou `BAZOS_SESSION_PATH`. Když už cookies máš z prohlížeče, můžeš je předat jako `BAZOS_BID` a `BAZOS_BKOD` (a volitelně `BAZOS_PHONE`) v `env` u záznamu serveru. `session_status` řekne, jestli je session ověřená, hodnoty cookies nevrací. `clear_session` soubor smaže.

Úprava a smazání chtějí heslo, které jsi zadal při vložení inzerátu. Bez něj to Bazoš nepustí.

## Inzerát s fotkami

Fotka je soubor na disku počítače, kde běží MCP server. Do nástroje `create_ad` jde jako `image_paths`: seznam cest v pořadí nahrání. První fotka je hlavní. Server každou nahraje na Bazoš a k inzerátu připojí vrácené jméno souboru. URL, odkaz z chatu ani obrázek vložený jen do zprávy sám nestačí, dokud z něj není soubor na tom disku.

Řekni asistentovi plné cesty a pořadí:

> Založ inzerát v rubrice Auto, kategorie náhradní díly. Nadpis, popis, cena 1 500 Kč, PSČ 62100, jméno, telefon, e-mail. Heslo ti řeknu zvlášť. Fotky v tomhle pořadí:
>
> `/Users/domino/fotky/dil/01-celek.jpg`
>
> `/Users/domino/fotky/dil/02-detail.jpg`

Nebo ukaž na složku a pořadí nech na něm: „Fotky jsou ve složce `/Users/domino/fotky/dil`, použij všechny jpg, soubor `01` jako první.“

- Piš absolutní cestu. `~/fotky/a.jpg` server nerozbalí. Když řekneš složku s vlnovkou, ať ji asistent nejdřív převede na plnou cestu a teprve tu pošle do `image_paths`.
- Pořadí v seznamu je pořadí na inzerátu.
- Formát, velikost a počet hlídá Bazoš. Když soubor odmítne, vložení skončí hláškou k tomu souboru a inzerát se nezaloží.
- Úprava, u které fotky nezmíníš, nechá stávající sadu být.
- Úprava, u které řekneš nové fotky, tu sadu nahradí. Staré zůstanou jen tehdy, když jejich soubory do seznamu dáš znovu.

Víc dílů najednou patří do složky `inzeraty`. Každý díl má vlastní podsložku: fotky k nahrání a soubor `info.txt` s tím, co z fotky nejde spolehlivě vyčíst.

```text
inzeraty/
  bmw-e39-abs-pumpa/
    01-celek.jpg
    02-detail.jpg
    info.txt
  bmw-e39-ventil-topeni/
    01.jpg
    info.txt
```

Do `info.txt` napiš, co to je, z jakého auta, ročník, OEM číslo, cenu a stav (funkční, nezkoušeno, prasklé). Fotky se berou podle názvu, `01` je hlavní. Složka `inzeraty/` se do gitu necommituje.

Asistentovi pak stačí:

> Projdi `inzeraty`. Ke každému dílu navrhni nadpis a popis. Fotky ber v pořadí souborů. OEM, cenu a stav ber jen z `info.txt`. Co tam není, označ jako chybějící.

Návrh ještě nic nezakládá. Nahrání je až další věta: „Založ inzerát ze složky `inzeraty/bmw-e39-abs-pumpa`.“ Kontakt, doručení a cenu, které v `info.txt` nejsou, si asistent musí vyžádat. Nevymýšlí je.

## Nástroje

| Nástroj | K čemu je |
| --- | --- |
| `search_ads` | Hledání podle výrazu, rubriky, kategorie, PSČ, okolí, ceny a řazení. Jedna stránka, 20 inzerátů, `offset` po 20. |
| `get_ad` | Detail inzerátu podle čísla nebo URL. Telefon prodejce zůstane maskovaný, jak ho vrací Bazoš. |
| `list_sections` | Rubriky (Auto, PC, …), kód a slug. |
| `list_categories` | Kategorie v rubrice. Číselné `id` pro vložení, slug pro hledání. |
| `list_seller_ads` | Veřejné inzeráty prodejce podle `phone_id` a `email_id` z detailu. Nejsou to telefon ani e-mail. |
| `get_user_ratings` | Veřejné hodnocení prodejce podle stejných id. |
| `request_phone_code` | Pošle ověřovací SMS na vlastní české nebo slovenské číslo. |
| `confirm_phone_code` | Uloží session z kódu v SMS. |
| `session_status` | Jestli je session ověřená. |
| `clear_session` | Smaže uloženou session. |
| `list_my_ads` | Inzeráty podle e-mailu a telefonu uvedeného v inzerátu. |
| `create_ad` | Nový inzerát. Cena `kc`, `dohodou`, `v_textu`, `zdarma` nebo `nabidnete`. Fotky jsou `image_paths`, absolutní cesty v pořadí nahrání. |
| `update_ad` | Úprava heslem inzerátu. Stačí URL, nebo rubrika a číslo. Bez `image_paths` fotky zůstanou, s nimi se celá sada nahradí. |
| `delete_ad` | Smazání heslem inzerátu. |

## Za nic neručím

Projekt je tak, jak je. Bez záruky, že bude fungovat, že něco najde, vloží, smaže nebo že tím nepřijdeš o inzerát, účet nebo čas. Použití je na tobě.

- Neoficiální projekt. Bazoš o něm neví a žádnou podporu k němu neposkytuje.
- Čteš a posíláš data na cizí web. Platí podmínky Bazoše, ne tyhle stránky.
- Ověřuj si telefon, vkládej a maž jen svoje inzeráty. Hesla a kódy z SMS si nech pro sebe a nedávej je do chatu, kterému nevěříš.
- Není to nástroj na spam, masové vkládání ani obcházení limitů webu. Když to tak použiješ, následky jsou tvoje.
- Výsledky hledání jsou to, co zrovna vrátí web. Ceny, texty i dostupnost se mění a parsování taky.

Licence v `package.json` je MIT. Ani ta záruku nepřidává.

## English

Unofficial [MCP](https://modelcontextprotocol.io) server for [Bazos.cz](https://www.bazos.cz/), the Czech classifieds site. It lets an assistant in Cursor, Claude Desktop, or any other MCP client search public ads and, after you verify your own Czech or Slovak phone by SMS, list, create, edit, and delete **your** ads. There is no official Bazos API. The server submits the same forms as the website. A layout change on Bazos can break it. The first ad on a new phone may still require a 1 CZK account link done in the browser.

```bash
git clone https://github.com/domino1994/bazos.cz-mcp.git
cd bazos.cz-mcp
npm install
npm run build
```

Node.js 20+. Point your MCP client at the built file:

```json
{
  "mcpServers": {
    "bazos": {
      "command": "node",
      "args": ["/absolute/path/to/bazos/dist/index.js"]
    }
  }
}
```

Then ask in plain language: search by query, section, category slug, ZIP, radius, and price, open an ad, or manage your own listings. Photos on `create_ad` are `image_paths`: absolute file paths on the machine running the server, in upload order. The first file becomes the main photo. A chat attachment or a `~/` path is not enough until it is a real path the process can read. On `update_ad`, omitting `image_paths` keeps the current photos; passing new paths replaces the whole set.

For several new ads, use one folder per item under `inzeraty/`: the photos to upload, named so `01` is first, plus an `info.txt` with the part name, donor car, year, OEM number, price, and condition. Ask the assistant to draft a title and description from that file and the photos. It should not invent a price, OEM number, or condition that `info.txt` does not contain. Creating the ad is a separate step. Phone-verification cookies are stored in `~/.config/bazos-mcp/session.json` (mode `0600`). Override the path with `BAZOS_SESSION_PATH`, or pass existing browser cookies as `BAZOS_BID` and `BAZOS_BKOD`. Ad passwords are not stored.

This is provided as is, with no warranty of any kind. It is not affiliated with Bazos. You are responsible for how you use it, for the ads you publish, and for following Bazos' terms. Don't use it to spam or to touch ads that are not yours.

Tools: `search_ads`, `get_ad`, `list_sections`, `list_categories`, `list_seller_ads`, `get_user_ratings`, `request_phone_code`, `confirm_phone_code`, `session_status`, `clear_session`, `list_my_ads`, `create_ad`, `update_ad`, `delete_ad`.
