// Stable option VALUES for the quote/contact "Standard" select (locale-independent —
// what gets submitted); display labels come from the dictionary's form.standardOptions,
// index-aligned with this list. Shared by the hero quote form (client) and the Contact
// section form (server) — lives outside both so the server component can import it as
// plain data (importing it from the "use client" module would make it a client reference).
export const STANDARD_VALUES = [
  "OEKO-TEX Standard 100",
  "ISO 9001",
  "GRS (Recycled)",
  "GOTS (Organic)",
  "Other / Custom",
];
