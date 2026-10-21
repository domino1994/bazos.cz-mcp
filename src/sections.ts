export interface Section {
  id: string;
  slug: string;
  title: string;
}

export const SECTIONS: Section[] = [
  { id: "AU", slug: "auto", title: "Auto" },
  { id: "DE", slug: "deti", title: "Děti" },
  { id: "DU", slug: "dum", title: "Dům a zahrada" },
  { id: "EL", slug: "elektro", title: "Elektro" },
  { id: "FO", slug: "foto", title: "Foto" },
  { id: "HU", slug: "hudba", title: "Hudba" },
  { id: "KN", slug: "knihy", title: "Knihy" },
  { id: "MO", slug: "mobil", title: "Mobily" },
  { id: "MT", slug: "motorky", title: "Motorky" },
  { id: "NA", slug: "nabytek", title: "Nábytek" },
  { id: "OB", slug: "obleceni", title: "Oblečení" },
  { id: "PC", slug: "pc", title: "PC" },
  { id: "PR", slug: "prace", title: "Práce" },
  { id: "RE", slug: "reality", title: "Reality" },
  { id: "SL", slug: "sluzby", title: "Služby" },
  { id: "SP", slug: "sport", title: "Sport" },
  { id: "ST", slug: "stroje", title: "Stroje" },
  { id: "VS", slug: "vstupenky", title: "Vstupenky" },
  { id: "ZV", slug: "zvirata", title: "Zvířata" },
  { id: "OS", slug: "ostatni", title: "Ostatní" },
];

export function resolveSection(value: string): Section {
  const key = value.trim().toLowerCase();
  const found = SECTIONS.find(
    (section) =>
      section.id.toLowerCase() === key ||
      section.slug === key ||
      section.title.toLowerCase() === key,
  );
  if (!found) {
    throw new Error(
      `Neznámá rubrika „${value}“. Použij kód (PC) nebo slug (pc). Seznam vrací list_sections.`,
    );
  }
  return found;
}

export function sectionOrigin(section: Section): string {
  return `https://${section.slug}.bazos.cz`;
}
