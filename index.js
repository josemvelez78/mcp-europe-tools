import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import http from "http";

// ════════════════════════════════════════════════
// SHARED HELPERS (timezone-safe)
// ════════════════════════════════════════════════

// Format Date as YYYY-MM-DD using LOCAL time (avoids UTC offset bugs)
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const getEaster = (y) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
};

// Returns array of YYYY-MM-DD strings of moveable (Easter-based) holidays for a country/year
const getMoveableHolidayDates = (year, country) => {
  const easter = getEaster(year);
  const dates = [];
  if (country === "FR") {
    dates.push(fmt(addDays(easter, 1)));   // Lundi de Pâques
    dates.push(fmt(addDays(easter, 39)));  // Ascension
    dates.push(fmt(addDays(easter, 50)));  // Lundi de Pentecôte
  }
  if (country === "DE") {
    dates.push(fmt(addDays(easter, -2)));  // Karfreitag
    dates.push(fmt(addDays(easter, 1)));   // Ostermontag
    dates.push(fmt(addDays(easter, 39)));  // Himmelfahrt
    dates.push(fmt(addDays(easter, 50)));  // Pfingstmontag
  }
  if (country === "NL") {
    dates.push(fmt(addDays(easter, -2)));  // Goede Vrijdag
    dates.push(fmt(addDays(easter, 1)));   // Tweede Paasdag
    dates.push(fmt(addDays(easter, 39)));  // Hemelvaartsdag
    dates.push(fmt(addDays(easter, 50)));  // Tweede Pinksterdag
  }
  if (country === "BE") {
    dates.push(fmt(addDays(easter, 1)));   // Lundi de Pâques
    dates.push(fmt(addDays(easter, 39)));  // Ascension
    dates.push(fmt(addDays(easter, 50)));  // Lundi de Pentecôte
  }
  if (country === "UK") {
    dates.push(fmt(addDays(easter, -2)));  // Good Friday
    dates.push(fmt(addDays(easter, 1)));   // Easter Monday
  }
  if (country === "IT") {
    dates.push(fmt(addDays(easter, 1)));   // Pasquetta
  }
  if (country === "ES") {
    dates.push(fmt(addDays(easter, -2)));  // Viernes Santo
  }
  if (country === "PT") {
    dates.push(fmt(addDays(easter, -2)));  // Sexta-feira Santa
  }
  return dates;
};

const FIXED_HOLIDAYS = {
  PT: ["01-01","04-25","05-01","06-10","08-15","10-05","11-01","12-01","12-08","12-25"],
  ES: ["01-01","01-06","05-01","08-15","10-12","11-01","12-06","12-08","12-25"],
  FR: ["01-01","05-01","05-08","07-14","08-15","11-01","11-11","12-25"],
  DE: ["01-01","05-01","10-03","12-25","12-26"],
  IT: ["01-01","01-06","04-25","05-01","06-02","08-15","11-01","12-08","12-25","12-26"],
  NL: ["01-01","04-27","05-05","12-25","12-26"],
  BE: ["01-01","05-01","07-21","08-15","11-01","11-11","12-25"],
  UK: ["01-01","12-25","12-26"],
};

// ════════════════════════════════════════════════
// SERVER FACTORY
// ════════════════════════════════════════════════

const createServer = () => {
  const server = new McpServer({
    name: "mcp-europe-business",
    version: "1.2.0",
    description: "European business compliance suite for AI agents. Covers tax ID validation for PT, ES, FR, DE, IT, UK, NL; IBAN verification; VAT rates and invoice rules for 18+ EU countries; business rules for payment terms, e-invoicing and VAT thresholds; labor calendar helpers; and invoice/VAT calculation tools. No auth required, read-only, offline."
  });

  // ════════════════════════════════════════════════
  // MODULE 1 — VALIDATION (17 tools)
  // ════════════════════════════════════════════════

  // ── 1. Validate Portuguese NIF ──
  server.registerTool("validate_nif", {
    description: "Validates a Portuguese NIF (Número de Identificação Fiscal) — the 9-digit tax identification number issued by the Portuguese Tax Authority (AT) to individuals and companies. Applies the official modulo-11 checksum algorithm to verify the check digit. Returns { valid: true, nif: string } for valid NIFs, or { valid: false, reason: string } for invalid format or failed checksum. First-digit rules are enforced: 1–3 for individuals, 5 for corporations, 6 for public entities, 7–8 for other entities, 9 for occasional taxpayers. Use when processing Portuguese invoices (faturas), onboarding suppliers, validating user registrations, or any fiscal compliance workflow. Does not query the AT database — offline format and checksum validation only.",
    inputSchema: { nif: z.string().describe("9-digit Portuguese NIF, with or without spaces. Example: '123456789'") },
    outputSchema: { valid: z.boolean(), nif: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate Portuguese NIF", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ nif }) => {
    const clean = nif.replace(/\s/g, "");
    if (!/^\d{9}$/.test(clean)) { const r = { valid: false, reason: "NIF must have exactly 9 digits" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const validFirst = [1,2,3,5,6,7,8,9];
    if (!validFirst.includes(parseInt(clean[0]))) { const r = { valid: false, reason: "Invalid first digit" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(clean[i]) * (9 - i);
    const remainder = sum % 11;
    const checkDigit = remainder < 2 ? 0 : 11 - remainder;
    const valid = checkDigit === parseInt(clean[8]);
    const r = { valid, nif: clean };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 2. Validate IBAN ──
  server.registerTool("validate_iban", {
    description: "Validates an IBAN (International Bank Account Number) using the ISO 13616 MOD-97 algorithm. Supports 18 European countries: PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR. Returns { valid: boolean, country: string, iban: string } — country is extracted from the 2-letter prefix. Returns { valid: false, reason: string } for malformed input. Spaces are automatically stripped before validation. Use when validating supplier bank details for SEPA transfers, processing direct debit mandates, verifying payment data in e-commerce checkouts, or any workflow requiring a verified EU bank account number. Validates structure and checksum only — does not confirm account existence.",
    inputSchema: { iban: z.string().describe("European IBAN with or without spaces. Example: 'PT50 0002 0123 1234 5678 9015 4'") },
    outputSchema: { valid: z.boolean(), country: z.string().optional(), iban: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate IBAN", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ iban }) => {
    const clean = iban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) { const r = { valid: false, reason: "Invalid IBAN format" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    const numeric = rearranged.split("").map(c => isNaN(c) ? (c.charCodeAt(0) - 55).toString() : c).join("");
    let remainder = 0;
    for (let i = 0; i < numeric.length; i++) remainder = (remainder * 10 + parseInt(numeric[i])) % 97;
    const valid = remainder === 1;
    const r = { valid, country: clean.slice(0, 2), iban: clean };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 3. Get EU VAT Rate ──
  server.registerTool("get_vat_rate", {
    description: "Returns all VAT (Value Added Tax) rates for a given EU country — standard, reduced, intermediate, and super-reduced rates where applicable, as numeric percentages. Returns { country, standard, reduced?, intermediate?, superreduced? } for supported countries, or { error, available } listing all valid codes if the country is not found. Supports 19 European countries: PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR, UK. Use when calculating EU cross-border invoice tax, determining correct rate for e-commerce checkout by customer country, generating compliant VAT breakdowns, or any workflow requiring accurate and current EU VAT rates per jurisdiction.",
    inputSchema: { country_code: z.string().describe("Two-letter ISO 3166-1 alpha-2 country code. Example: 'PT', 'FR', 'DE'") },
    outputSchema: { country: z.string().optional(), standard: z.number().optional(), reduced: z.number().optional(), intermediate: z.number().optional(), superreduced: z.number().optional(), error: z.string().optional() },
    annotations: { title: "Get EU VAT Rate", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code }) => {
    const rates = {
      PT: { standard: 23, intermediate: 13, reduced: 6, country: "Portugal" },
      ES: { standard: 21, reduced: 10, superreduced: 4, country: "Spain" },
      FR: { standard: 20, intermediate: 10, reduced: 5.5, superreduced: 2.1, country: "France" },
      DE: { standard: 19, reduced: 7, country: "Germany" },
      IT: { standard: 22, reduced: 10, superreduced: 4, country: "Italy" },
      NL: { standard: 21, reduced: 9, country: "Netherlands" },
      BE: { standard: 21, intermediate: 12, reduced: 6, country: "Belgium" },
      PL: { standard: 23, intermediate: 8, reduced: 5, country: "Poland" },
      SE: { standard: 25, intermediate: 12, reduced: 6, country: "Sweden" },
      DK: { standard: 25, country: "Denmark" },
      FI: { standard: 25.5, intermediate: 14, reduced: 10, country: "Finland" },
      AT: { standard: 20, intermediate: 13, reduced: 10, country: "Austria" },
      IE: { standard: 23, intermediate: 13.5, reduced: 9, superreduced: 4.8, country: "Ireland" },
      GR: { standard: 24, intermediate: 13, reduced: 6, country: "Greece" },
      HU: { standard: 27, intermediate: 18, reduced: 5, country: "Hungary" },
      RO: { standard: 19, intermediate: 9, reduced: 5, country: "Romania" },
      CZ: { standard: 21, intermediate: 12, reduced: 0, country: "Czech Republic" },
      HR: { standard: 25, intermediate: 13, reduced: 5, country: "Croatia" },
      UK: { standard: 20, reduced: 5, country: "United Kingdom" },
    };
    const code = country_code.toUpperCase();
    const data = rates[code];
    if (!data) { const r = { error: `Country ${code} not found. Available: ${Object.keys(rates).join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  });

  // ── 4. Get Portugal Holidays ──
  server.registerTool("get_portugal_holidays", {
    description: "Returns all Portuguese national public holidays for a given year as a structured list. Each holiday includes { date: 'YYYY-MM-DD', name: string, name_en: string }. Includes Easter-based moveable holiday (Sexta-feira Santa) calculated dynamically. Returns 11 mandatory national holidays defined by Portuguese law. Use when calculating business deadlines, delivery dates, payment due dates, SLA periods, or scheduling tasks that must avoid non-working days in Portugal.",
    inputSchema: { year: z.number().describe("Calendar year as a 4-digit integer. Example: 2026") },
    outputSchema: { year: z.number(), country: z.string(), total_holidays: z.number(), holidays: z.array(z.object({ date: z.string(), name: z.string(), name_en: z.string() })) },
    annotations: { title: "Get Portugal Public Holidays", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ year }) => {
    const easter = getEaster(year);
    const holidays = [
      { date: `${year}-01-01`, name: "Ano Novo", name_en: "New Year's Day" },
      { date: fmt(addDays(easter, -2)), name: "Sexta-feira Santa", name_en: "Good Friday" },
      { date: `${year}-04-25`, name: "Dia da Liberdade", name_en: "Freedom Day" },
      { date: `${year}-05-01`, name: "Dia do Trabalhador", name_en: "Labour Day" },
      { date: `${year}-06-10`, name: "Dia de Portugal", name_en: "Portugal Day" },
      { date: `${year}-08-15`, name: "Assunção de Nossa Senhora", name_en: "Assumption of Mary" },
      { date: `${year}-10-05`, name: "Implantação da República", name_en: "Republic Day" },
      { date: `${year}-11-01`, name: "Dia de Todos os Santos", name_en: "All Saints Day" },
      { date: `${year}-12-01`, name: "Restauração da Independência", name_en: "Independence Restoration Day" },
      { date: `${year}-12-08`, name: "Imaculada Conceição", name_en: "Immaculate Conception" },
      { date: `${year}-12-25`, name: "Natal", name_en: "Christmas Day" },
    ];
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    const r = { year, country: "Portugal", total_holidays: holidays.length, holidays };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 5. Get Spain Holidays ──
  server.registerTool("get_spain_holidays", {
    description: "Returns all Spanish national public holidays for a given year as a structured list. Each holiday includes { date: 'YYYY-MM-DD', name: string, name_en: string }. Includes Easter-based moveable holiday (Viernes Santo) calculated dynamically. Returns 10 mandatory national holidays defined by Spanish law. Does not include regional holidays that vary by autonomous community.",
    inputSchema: { year: z.number().describe("Calendar year as a 4-digit integer. Example: 2026") },
    outputSchema: { year: z.number(), country: z.string(), total_holidays: z.number(), holidays: z.array(z.object({ date: z.string(), name: z.string(), name_en: z.string() })) },
    annotations: { title: "Get Spain Public Holidays", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ year }) => {
    const easter = getEaster(year);
    const holidays = [
      { date: `${year}-01-01`, name: "Año Nuevo", name_en: "New Year's Day" },
      { date: `${year}-01-06`, name: "Epifanía del Señor", name_en: "Epiphany" },
      { date: fmt(addDays(easter, -2)), name: "Viernes Santo", name_en: "Good Friday" },
      { date: `${year}-05-01`, name: "Fiesta del Trabajo", name_en: "Labour Day" },
      { date: `${year}-08-15`, name: "Asunción de la Virgen", name_en: "Assumption of Mary" },
      { date: `${year}-10-12`, name: "Fiesta Nacional de España", name_en: "Spanish National Day" },
      { date: `${year}-11-01`, name: "Todos los Santos", name_en: "All Saints Day" },
      { date: `${year}-12-06`, name: "Día de la Constitución Española", name_en: "Constitution Day" },
      { date: `${year}-12-08`, name: "Inmaculada Concepción", name_en: "Immaculate Conception" },
      { date: `${year}-12-25`, name: "Navidad", name_en: "Christmas Day" },
    ];
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    const r = { year, country: "Spain", total_holidays: holidays.length, holidays };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 6. Get France Holidays ──
  server.registerTool("get_france_holidays", {
    description: "Returns all French national public holidays for a given year. Easter-dependent holidays (Easter Monday, Ascension, Whit Monday) are dynamically calculated using the Anonymous Gregorian algorithm. Returns 11 mandatory holidays defined by French law.",
    inputSchema: { year: z.number().describe("Calendar year as a 4-digit integer. Example: 2026") },
    outputSchema: { year: z.number(), country: z.string(), total_holidays: z.number(), holidays: z.array(z.object({ date: z.string(), name: z.string(), name_en: z.string() })) },
    annotations: { title: "Get France Public Holidays", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ year }) => {
    const easter = getEaster(year);
    const holidays = [
      { date: `${year}-01-01`, name: "Jour de l'An", name_en: "New Year's Day" },
      { date: fmt(addDays(easter, 1)), name: "Lundi de Pâques", name_en: "Easter Monday" },
      { date: `${year}-05-01`, name: "Fête du Travail", name_en: "Labour Day" },
      { date: `${year}-05-08`, name: "Victoire 1945", name_en: "Victory in Europe Day" },
      { date: fmt(addDays(easter, 39)), name: "Ascension", name_en: "Ascension Day" },
      { date: fmt(addDays(easter, 50)), name: "Lundi de Pentecôte", name_en: "Whit Monday" },
      { date: `${year}-07-14`, name: "Fête Nationale", name_en: "Bastille Day" },
      { date: `${year}-08-15`, name: "Assomption", name_en: "Assumption of Mary" },
      { date: `${year}-11-01`, name: "Toussaint", name_en: "All Saints Day" },
      { date: `${year}-11-11`, name: "Armistice", name_en: "Armistice Day" },
      { date: `${year}-12-25`, name: "Noël", name_en: "Christmas Day" },
    ];
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    const r = { year, country: "France", total_holidays: holidays.length, holidays };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 7. Validate Spanish NIF/NIE/CIF ──
  server.registerTool("validate_nif_es", {
    description: "Validates Spanish tax identification numbers — NIF (DNI, 8 digits + check letter, for Spanish citizens), NIE (Número de Identidad de Extranjero, starts with X/Y/Z, for foreign residents), and CIF (Código de Identificación Fiscal, letter + 7 digits + control, for companies). Automatically detects the document type. Applies the official check letter algorithm based on the modulo-23 lookup table 'TRWAGMYFPDXBNJZSQVHLCKE'. Returns { valid: boolean, type: 'NIF'|'NIE'|'CIF', id: string } or { valid: false, reason: string }. Use when processing Spanish invoices, supplier registration, or any Spanish tax compliance workflow.",
    inputSchema: { id: z.string().describe("Spanish NIF, NIE or CIF. Examples: '12345678Z' (NIF), 'X1234567L' (NIE), 'B12345678' (CIF)") },
    outputSchema: { valid: z.boolean(), type: z.enum(["NIF","NIE","CIF"]).optional(), id: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate Spanish NIF / NIE / CIF", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ id }) => {
    const clean = id.replace(/\s/g, "").toUpperCase();
    const nifLetters = "TRWAGMYFPDXBNJZSQVHLCKE";
    if (/^\d{8}[A-Z]$/.test(clean)) {
      const valid = clean[8] === nifLetters[parseInt(clean.slice(0, 8)) % 23];
      const r = { valid, type: "NIF", id: clean };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    if (/^[XYZ]\d{7}[A-Z]$/.test(clean)) {
      const nieMap = { X: "0", Y: "1", Z: "2" };
      const valid = clean[8] === nifLetters[parseInt(nieMap[clean[0]] + clean.slice(1, 8)) % 23];
      const r = { valid, type: "NIE", id: clean };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(clean)) {
      const letters = "JABCDEFGHI";
      let sumOdd = 0, sumEven = 0;
      for (let i = 1; i <= 7; i++) {
        const digit = parseInt(clean[i]);
        if (i % 2 === 0) sumEven += digit;
        else { const dd = digit * 2; sumOdd += dd > 9 ? dd - 9 : dd; }
      }
      const controlDigit = (10 - ((sumOdd + sumEven) % 10)) % 10;
      const valid = clean[8] === controlDigit.toString() || clean[8] === letters[controlDigit];
      const r = { valid, type: "CIF", id: clean };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    const r = { valid: false, reason: "Format not recognized. Expected NIF (8 digits + letter), NIE (X/Y/Z + 7 digits + letter) or CIF (letter + 7 digits + control)" };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 8. Validate French SIRET ──
  server.registerTool("validate_siret", {
    description: "Validates a French SIRET (14-digit company establishment number) using the official Luhn algorithm. The first 9 digits are the SIREN (company identifier) and the last 5 identify the specific establishment. Returns { valid: boolean, siren: string, establishment: string, siret: string } or { valid: false, reason: string }. Handles the La Poste special case automatically (SIREN 356000000 uses sum-modulo-5 instead of Luhn). Use when processing French B2B invoices, supplier validation, or any French business compliance workflow involving establishment-level identification.",
    inputSchema: { siret: z.string().describe("14-digit French SIRET, with or without spaces/dashes. Example: '732 829 320 00074'") },
    outputSchema: { valid: z.boolean(), siren: z.string().optional(), establishment: z.string().optional(), siret: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate French SIRET", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ siret }) => {
    const clean = siret.replace(/[\s\-]/g, "");
    if (!/^\d{14}$/.test(clean)) { const r = { valid: false, reason: "SIRET must have exactly 14 digits" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    if (clean.startsWith("356000000")) {
      const valid = clean.split("").reduce((acc, d) => acc + parseInt(d), 0) % 5 === 0;
      const r = { valid, siren: clean.substring(0, 9), establishment: clean.substring(9), siret: clean };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let digit = parseInt(clean[i]);
      if (i % 2 === 0) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    const r = { valid: sum % 10 === 0, siren: clean.substring(0, 9), establishment: clean.substring(9), siret: clean };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 9. Validate French TVA ──
  server.registerTool("validate_tva_fr", {
    description: "Validates a French TVA intracom (VAT) number — format 'FR' + 2 alphanumeric key characters + 9-digit SIREN. Returns { valid: boolean, key: string, siren: string, tva: string } or { valid: false, reason: string }. When the key is numeric, validates using the official formula: key = (12 + 3 × (SIREN mod 97)) mod 97. When the key is alphanumeric, format is verified but checksum is not applicable. Use when processing French intra-EU B2B invoices or validating French VAT-registered suppliers.",
    inputSchema: { tva: z.string().describe("French TVA intracom number. Example: 'FR40303265045'") },
    outputSchema: { valid: z.boolean(), key: z.string().optional(), siren: z.string().optional(), tva: z.string().optional(), reason: z.string().optional(), note: z.string().optional() },
    annotations: { title: "Validate French TVA (VAT) Number", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ tva }) => {
    const clean = tva.replace(/\s/g, "").toUpperCase();
    if (!/^FR[A-Z0-9]{2}\d{9}$/.test(clean)) { const r = { valid: false, reason: "French TVA must start with FR followed by 2 alphanumeric characters and 9 digits." }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const key = clean.substring(2, 4), siren = clean.substring(4);
    if (/^\d{2}$/.test(key)) {
      const valid = parseInt(key) === (12 + 3 * (parseInt(siren) % 97)) % 97;
      const r = { valid, key, siren, tva: clean };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    const r = { valid: true, key, siren, tva: clean, note: "Alphanumeric key — format valid, checksum not applicable" };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 10. Calculate Working Days (Portugal) ──
  server.registerTool("calculate_working_days", {
    description: "Counts the number of working days between two dates (inclusive) for Portugal, excluding Saturdays, Sundays, and all 11 Portuguese national public holidays (including Easter-based Sexta-feira Santa). Returns { start_date, end_date, working_days: number }. Use when calculating Portuguese invoice payment deadlines, legal notice periods, or SLA response times. For other EU countries use calculate_working_days_eu.",
    inputSchema: {
      start_date: z.string().describe("Start date in YYYY-MM-DD format. Example: '2026-01-01'"),
      end_date: z.string().describe("End date in YYYY-MM-DD format. Example: '2026-01-31'")
    },
    outputSchema: { start_date: z.string().optional(), end_date: z.string().optional(), working_days: z.number().optional(), error: z.string().optional() },
    annotations: { title: "Calculate Portuguese Working Days", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ start_date, end_date }) => {
    const start = new Date(start_date), end = new Date(end_date);
    if (isNaN(start) || isNaN(end)) { const r = { error: "Invalid date format. Use YYYY-MM-DD" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const fixed = FIXED_HOLIDAYS.PT;
    const moveableByYear = {};
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) moveableByYear[y] = getMoveableHolidayDates(y, "PT");
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const dow = current.getDay();
      const mmdd = `${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      const fullDate = fmt(current);
      const isHoliday = fixed.includes(mmdd) || (moveableByYear[current.getFullYear()] || []).includes(fullDate);
      if (dow !== 0 && dow !== 6 && !isHoliday) count++;
      current.setDate(current.getDate() + 1);
    }
    const r = { start_date, end_date, working_days: count };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 11. Format Number European ──
  server.registerTool("format_number_european", {
    description: "Formats a number using the locale conventions of a specific European country — correct decimal and thousands separators following Intl.NumberFormat standards. Returns { original, formatted, locale, country_code }. Supports 17 European locales: PT (1.234,56), ES (1.234,56), FR (1 234,56), DE (1.234,56), IT (1.234,56), NL (1.234,56), BE (1.234,56), PL (1 234,56), SE (1 234,56), DK (1.234,56), FI (1 234,56), AT (1.234,56), IE (1,234.56), GR (1.234,56), HU (1 234,56), RO (1.234,56), UK (1,234.56). Use when displaying prices, financial amounts, or numeric data in user-facing applications across multiple European markets.",
    inputSchema: {
      number: z.number().describe("The numeric value to format. Example: 1234.56"),
      country_code: z.string().describe("Two-letter country code. Example: 'PT', 'FR', 'DE'"),
      decimals: z.number().optional().describe("Number of decimal places. Defaults to 2.")
    },
    outputSchema: { original: z.number(), formatted: z.string(), locale: z.string(), country_code: z.string() },
    annotations: { title: "Format Number European Locale", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ number, country_code, decimals = 2 }) => {
    const localeMap = { PT:"pt-PT",ES:"es-ES",FR:"fr-FR",DE:"de-DE",IT:"it-IT",NL:"nl-NL",BE:"fr-BE",PL:"pl-PL",SE:"sv-SE",DK:"da-DK",FI:"fi-FI",AT:"de-AT",IE:"en-IE",GR:"el-GR",HU:"hu-HU",RO:"ro-RO",UK:"en-GB" };
    const locale = localeMap[country_code.toUpperCase()] || "en-GB";
    const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number);
    const r = { original: number, formatted, locale, country_code };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 12. Validate Italian Codice Fiscale ──
  server.registerTool("validate_codice_fiscale", {
    description: "Validates an Italian Codice Fiscale (fiscal code) for individuals — a 16-character alphanumeric code issued by the Italian Revenue Agency (Agenzia delle Entrate). Applies the official odd/even position checksum algorithm with the standard letter-to-value mapping tables. Returns { valid: boolean, codice_fiscale: string } or { valid: false, reason: string }. Use when processing Italian invoices, onboarding Italian individuals, or any Italian compliance workflow requiring a verified personal fiscal code. Format validation only — does not query Agenzia delle Entrate.",
    inputSchema: { codice_fiscale: z.string().describe("16-character Italian Codice Fiscale. Example: 'RSSMRA85T10A562S'") },
    outputSchema: { valid: z.boolean(), codice_fiscale: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate Italian Codice Fiscale", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ codice_fiscale }) => {
    const clean = codice_fiscale.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(clean)) {
      const r = { valid: false, reason: "Codice Fiscale must be 16 characters: 6 letters, 2 digits, 1 letter, 2 digits, 1 letter, 3 digits, 1 letter" };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    const oddValues = { 0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23 };
    const evenValues = { 0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25 };
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      const char = clean[i];
      sum += (i % 2 === 0) ? oddValues[char] : evenValues[char];
    }
    const expectedCheck = String.fromCharCode(65 + (sum % 26));
    const valid = clean[15] === expectedCheck;
    const r = { valid, codice_fiscale: clean };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 13. Validate Italian Partita IVA ──
  server.registerTool("validate_partita_iva", {
    description: "Validates an Italian Partita IVA (VAT number for companies and self-employed) — an 11-digit number issued by the Italian Revenue Agency. Applies the official Luhn-variant checksum algorithm used by Italian tax authorities. Returns { valid: boolean, partita_iva: string } or { valid: false, reason: string }. Use when processing Italian B2B invoices via SDI, validating Italian suppliers, or any Italian business compliance workflow requiring a verified VAT-registered entity.",
    inputSchema: { partita_iva: z.string().describe("11-digit Italian Partita IVA, with or without spaces. Example: '12345670017'") },
    outputSchema: { valid: z.boolean(), partita_iva: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate Italian Partita IVA", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ partita_iva }) => {
    const clean = partita_iva.replace(/\s/g, "");
    if (!/^\d{11}$/.test(clean)) { const r = { valid: false, reason: "Partita IVA must have exactly 11 digits" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let digit = parseInt(clean[i]);
      if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    const valid = (10 - (sum % 10)) % 10 === parseInt(clean[10]);
    const r = { valid, partita_iva: clean };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 14. Validate German VAT (USt-IdNr) ──
  server.registerTool("validate_vat_de", {
    description: "Validates a German VAT identification number (Umsatzsteuer-Identifikationsnummer, USt-IdNr) — format 'DE' followed by 9 digits. Verifies the format and applies the official ISO 7064 MOD-11-10 checksum algorithm. Returns { valid: boolean, vat_number: string, country: 'DE' } or { valid: false, reason: string }. Use when processing German B2B invoices, validating German suppliers for intra-EU reverse charge transactions, or any compliance workflow requiring a verified German VAT registration.",
    inputSchema: { vat_number: z.string().describe("German VAT number with or without spaces. Example: 'DE123456789'") },
    outputSchema: { valid: z.boolean(), vat_number: z.string().optional(), country: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate German VAT Number", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ vat_number }) => {
    const clean = vat_number.replace(/\s/g, "").toUpperCase();
    if (!/^DE\d{9}$/.test(clean)) { const r = { valid: false, reason: "German VAT must start with DE followed by exactly 9 digits. Example: DE123456789" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const digits = clean.substring(2);
    let product = 10;
    for (let i = 0; i < 8; i++) {
      let sum = (parseInt(digits[i]) + product) % 10;
      if (sum === 0) sum = 10;
      product = (2 * sum) % 11;
    }
    const checkDigit = 11 - product === 10 ? 0 : 11 - product;
    const valid = checkDigit === parseInt(digits[8]);
    const r = { valid, vat_number: clean, country: "DE" };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 15. Validate UK VAT Number ──
  server.registerTool("validate_vat_uk", {
    description: "Validates a UK VAT registration number — format 'GB' followed by 9 digits (standard), 12 digits (branch traders), or 'GD'/'HA' followed by 3 digits (government departments / health authorities). Applies the official HMRC modulo-97 algorithm with both legacy (mod 97) and current (mod 97 + 55) checksum variants. Returns { valid: boolean, vat_number: string, type: string, country: 'GB' }. Use when processing UK invoices post-Brexit, validating UK suppliers, or any B2B workflow involving UK VAT-registered entities. Recognizes all 4 UK VAT number types.",
    inputSchema: { vat_number: z.string().describe("UK VAT number with or without spaces. Example: 'GB123456789' or '123456789'") },
    outputSchema: { valid: z.boolean(), vat_number: z.string().optional(), type: z.string().optional(), country: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate UK VAT Number", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ vat_number }) => {
    let clean = vat_number.replace(/\s/g, "").toUpperCase();
    if (!clean.startsWith("GB")) clean = "GB" + clean;
    if (/^GB(GD|HA)\d{3}$/.test(clean)) {
      const type = clean.substring(2, 4) === "GD" ? "Government department" : "Health authority";
      const r = { valid: true, vat_number: clean, type, country: "GB" };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    }
    if (!/^GB\d{9}(\d{3})?$/.test(clean)) { const r = { valid: false, reason: "UK VAT must be GB followed by 9 or 12 digits, or GBGD/GBHA followed by 3 digits" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const digits = clean.substring(2, 11);
    const weights = [8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += parseInt(digits[i]) * weights[i];
    const checkDigits = parseInt(digits.substring(7, 9));
    let remainder = sum % 97;
    const valid = (97 - remainder) === checkDigits || (97 - ((sum + 55) % 97)) === checkDigits;
    const type = clean.length === 11 ? "Standard" : "Branch trader";
    const r = { valid, vat_number: clean, type, country: "GB" };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 16. Validate Dutch KVK Number ──
  server.registerTool("validate_kvk_nl", {
    description: "Validates a Dutch KVK (Kamer van Koophandel) chamber of commerce number — an 8-digit registration number assigned to all businesses registered in the Netherlands. Verifies the format and applies the official weighted checksum algorithm (weights 8,7,6,5,4,3,2,1, sum modulo 11). Returns { valid: boolean, kvk: string, country: 'NL' } or { valid: false, reason: string }. Use when processing Dutch invoices, validating Dutch suppliers, or onboarding Dutch business partners requiring chamber of commerce verification.",
    inputSchema: { kvk: z.string().describe("8-digit Dutch KVK number, with or without spaces. Example: '12345678'") },
    outputSchema: { valid: z.boolean(), kvk: z.string().optional(), country: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate Dutch KVK Number", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ kvk }) => {
    const clean = kvk.replace(/\s/g, "");
    if (!/^\d{8}$/.test(clean)) { const r = { valid: false, reason: "KVK number must have exactly 8 digits" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const weights = [8, 7, 6, 5, 4, 3, 2, 1];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(clean[i]) * weights[i];
    const valid = sum % 11 === 0;
    const r = { valid, kvk: clean, country: "NL" };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 17. Validate European Postal Code ──
  server.registerTool("validate_postal_code", {
    description: "Validates a postal code format for a given European country using the official pattern for that country. Returns { valid: boolean, postal_code: string, country: string, format: string }. Supports 16 European countries: PT (4-3 digit), ES (5 digit), FR (5 digit), DE (5 digit), IT (5 digit), NL (4 digits + 2 letters), BE (4 digit), PL (5+2 digit), SE (5 digit), AT (4 digit), IE (Eircode 3+4), GR (5 digit), HU (4 digit), RO (6 digit), UK/GB (complex alphanumeric). Use in e-commerce checkout validation, address verification, or logistics workflows across European markets.",
    inputSchema: {
      postal_code: z.string().describe("Postal code to validate. Example: '1000-001' for PT, '28001' for ES, 'SW1A 1AA' for UK"),
      country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'UK'")
    },
    outputSchema: { valid: z.boolean(), postal_code: z.string().optional(), country: z.string().optional(), format: z.string().optional(), reason: z.string().optional() },
    annotations: { title: "Validate European Postal Code", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ postal_code, country_code }) => {
    const patterns = {
      PT: { regex: /^\d{4}-\d{3}$/, format: "NNNN-NNN" },
      ES: { regex: /^\d{5}$/, format: "NNNNN" },
      FR: { regex: /^\d{5}$/, format: "NNNNN" },
      DE: { regex: /^\d{5}$/, format: "NNNNN" },
      IT: { regex: /^\d{5}$/, format: "NNNNN" },
      NL: { regex: /^\d{4}\s?[A-Z]{2}$/i, format: "NNNN AA" },
      BE: { regex: /^\d{4}$/, format: "NNNN" },
      PL: { regex: /^\d{2}-\d{3}$/, format: "NN-NNN" },
      SE: { regex: /^\d{3}\s?\d{2}$/, format: "NNN NN" },
      AT: { regex: /^\d{4}$/, format: "NNNN" },
      IE: { regex: /^[A-Z]\d{2}\s?[A-Z0-9]{4}$/i, format: "A99 XXXX (Eircode)" },
      GR: { regex: /^\d{3}\s?\d{2}$/, format: "NNN NN" },
      HU: { regex: /^\d{4}$/, format: "NNNN" },
      RO: { regex: /^\d{6}$/, format: "NNNNNN" },
      UK: { regex: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, format: "AN NAA / ANN NAA / AAN NAA" },
      GB: { regex: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, format: "AN NAA / ANN NAA / AAN NAA" },
    };
    const code = country_code.toUpperCase();
    const pattern = patterns[code];
    if (!pattern) { const r = { valid: false, reason: `Country ${code} not supported. Supported: ${Object.keys(patterns).join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const clean = postal_code.trim().toUpperCase();
    const valid = pattern.regex.test(clean);
    const r = { valid, postal_code: clean, country: code, format: pattern.format };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ════════════════════════════════════════════════
  // MODULE 2 — BUSINESS RULES (4 tools)
  // ════════════════════════════════════════════════

  // ── 18. Get Payment Terms ──
  server.registerTool("get_payment_terms", {
    description: "Returns the legal B2B payment terms for a given European country — the default payment period, maximum allowed period, and late payment rules as defined by EU Directive 2011/7/EU and local implementations. Returns { country, default_days, max_days, late_payment_interest, currency, notes }. Supports 10 countries: PT, ES, FR, DE, IT, NL, BE, UK, SE, PL. Use when generating invoices, setting payment due dates, automating accounts receivable workflows, or building cross-border collection processes. Information provided as reference only — not legal advice.",
    inputSchema: { country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'FR'") },
    outputSchema: { country: z.string().optional(), default_days: z.number().optional(), max_days: z.number().optional(), late_payment_interest: z.string().optional(), currency: z.string().optional(), notes: z.string().optional(), disclaimer: z.string().optional(), error: z.string().optional() },
    annotations: { title: "Get B2B Payment Terms", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code }) => {
    const terms = {
      PT: { country: "Portugal", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 8%", currency: "EUR", notes: "Law 62/2013. Public authorities must pay within 30 days." },
      ES: { country: "Spain", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 8%", currency: "EUR", notes: "Law 3/2004. Parties can agree up to 60 days maximum." },
      FR: { country: "France", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 10%", currency: "EUR", notes: "Code de Commerce Art. L441-10. Penalties for late payment are mandatory." },
      DE: { country: "Germany", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 9%", currency: "EUR", notes: "BGB §286. Interest accrues automatically after due date without reminder." },
      IT: { country: "Italy", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 8%", currency: "EUR", notes: "D.Lgs. 231/2002. Public authorities: 30 days, extendable to 60." },
      NL: { country: "Netherlands", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 8%", currency: "EUR", notes: "Wet handelsrente. Statutory interest applies automatically." },
      BE: { country: "Belgium", default_days: 30, max_days: 60, late_payment_interest: "ECB rate + 8%", currency: "EUR", notes: "Law of 2 August 2002. Recovery costs minimum €40." },
      UK: { country: "United Kingdom", default_days: 30, max_days: 60, late_payment_interest: "Bank of England rate + 8%", currency: "GBP", notes: "Late Payment of Commercial Debts Act 1998. Compensation: £40-£100 depending on debt size." },
      SE: { country: "Sweden", default_days: 30, max_days: 60, late_payment_interest: "Riksbank rate + 8%", currency: "SEK", notes: "Räntelagen. Reminder fee (inkassokrav) can be added." },
      PL: { country: "Poland", default_days: 30, max_days: 60, late_payment_interest: "NBP rate + 10%", currency: "PLN", notes: "Ustawa o terminach zapłaty. Large enterprises: max 60 days when trading with SMEs." },
    };
    const code = country_code.toUpperCase();
    const data = terms[code];
    if (!data) { const r = { error: `Country ${code} not found. Available: ${Object.keys(terms).join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const r = { ...data, disclaimer: "Reference information only — not legal advice. Verify with a qualified professional." };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 19. Get Invoice Requirements ──
  server.registerTool("get_invoice_requirements", {
    description: "Returns the mandatory fields required on a valid VAT invoice for a given European country, as defined by EU VAT Directive 2006/112/EC and local implementations. Returns { country, mandatory_fields: [], optional_fields: [], notes }. Supports 8 countries: PT, ES, FR, DE, IT, NL, BE, UK. Includes country-specific requirements such as ATCUD (Portugal), SDI codice destinatario (Italy), Factur-X / ZUGFeRD (France/Germany), KVK number (Netherlands). Use when generating invoices for EU customers, validating invoice templates, or building invoice compliance checks in agent workflows.",
    inputSchema: { country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'FR'") },
    outputSchema: { country: z.string().optional(), mandatory_fields: z.array(z.string()).optional(), optional_fields: z.array(z.string()).optional(), notes: z.string().optional(), disclaimer: z.string().optional(), error: z.string().optional() },
    annotations: { title: "Get Invoice Mandatory Fields", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code }) => {
    const baseFields = [
      "Sequential invoice number",
      "Invoice date",
      "Supplier name and address",
      "Supplier VAT/tax number",
      "Customer name and address",
      "Description of goods or services",
      "Quantity and unit price",
      "VAT rate applied",
      "VAT amount",
      "Total amount excluding VAT",
      "Total amount including VAT"
    ];
    const requirements = {
      PT: { country: "Portugal", mandatory_fields: [...baseFields, "Customer NIF (for B2B)", "ATCUD code (since 2023)", "Invoice series and sequence"], optional_fields: ["Customer VAT number (B2C)", "Payment method"], notes: "AT (Autoridade Tributária) requires certified invoicing software. ATCUD is mandatory since 2023." },
      ES: { country: "Spain", mandatory_fields: [...baseFields, "Customer NIF/CIF (for B2B)", "Place of supply if different"], optional_fields: ["Customer VAT number (B2C)", "Discount details"], notes: "Factura electrónica mandatory for B2G. Verifactu system being phased in 2024-2025." },
      FR: { country: "France", mandatory_fields: [...baseFields, "Customer SIRET (for B2B)", "Delivery address if different", "Payment terms"], optional_fields: ["Discount details", "Purchase order reference"], notes: "Facture électronique mandatory for B2G since 2017. B2B e-invoicing rollout 2024-2026." },
      DE: { country: "Germany", mandatory_fields: [...baseFields, "Customer VAT number (for B2B intra-EU)", "Tax point date if different from invoice date"], optional_fields: ["Bank details", "Skonto terms"], notes: "ZUGFeRD/XRechnung format required for B2G since 2020. B2B e-invoicing from 2025." },
      IT: { country: "Italy", mandatory_fields: [...baseFields, "Customer Codice Fiscale or Partita IVA", "SDI recipient code (codice destinatario)", "Progressive number"], optional_fields: ["CUP/CIG codes (for public contracts)"], notes: "Fattura elettronica mandatory for ALL B2B and B2C since 2019 via SDI system." },
      NL: { country: "Netherlands", mandatory_fields: [...baseFields, "Customer KVK number (recommended for B2B)", "BTW number (VAT)"], optional_fields: ["IBAN for payment", "Reference number"], notes: "E-invoicing mandatory for B2G (PEPPOL). B2B e-invoicing encouraged." },
      UK: { country: "United Kingdom", mandatory_fields: [...baseFields, "Supplier VAT registration number", "Tax point (time of supply)"], optional_fields: ["Customer VAT number", "Unique customer reference"], notes: "Post-Brexit UK VAT rules apply. Making Tax Digital (MTD) requires digital records." },
      BE: { country: "Belgium", mandatory_fields: [...baseFields, "Supplier VAT number (BE format)", "Customer VAT number (for B2B)"], optional_fields: ["Discount details", "Payment reference"], notes: "E-invoicing mandatory for B2G. B2B e-invoicing mandatory from 2026." },
    };
    const code = country_code.toUpperCase();
    const data = requirements[code];
    if (!data) { const r = { error: `Country ${code} not found. Available: ${Object.keys(requirements).join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const r = { ...data, disclaimer: "Reference information only — not legal advice. Verify with a qualified professional or tax authority." };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 20. Get VAT Exemption Threshold ──
  server.registerTool("get_vat_exemption_threshold", {
    description: "Returns the annual turnover threshold below which a business may be exempt from VAT registration in a given European country — the small business VAT exemption scheme. Returns { country, threshold_local_currency, currency, threshold_eur_approx, regime, notes }. Supports 10 countries: PT, ES, FR, DE, IT, NL, BE, UK, SE, PL. Includes regime names (Regime de isenção PT, Kleinunternehmerregelung DE, Regime forfettario IT, KOR NL, etc). Use when determining if a small business needs to register for VAT, building onboarding flows for European freelancers and micro-enterprises, or providing tax compliance guidance.",
    inputSchema: { country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'FR'") },
    outputSchema: { country: z.string().optional(), threshold_local_currency: z.number().nullable().optional(), currency: z.string().optional(), threshold_eur_approx: z.number().nullable().optional(), regime: z.string().optional(), notes: z.string().optional(), disclaimer: z.string().optional(), error: z.string().optional() },
    annotations: { title: "Get VAT Exemption Threshold", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code }) => {
    const thresholds = {
      PT: { country: "Portugal", threshold_local_currency: 13500, currency: "EUR", threshold_eur_approx: 13500, regime: "Regime de isenção (Art. 53 CIVA)", notes: "Threshold increased to €13,500 in 2023. Applies to services and goods. Cannot deduct input VAT." },
      ES: { country: "Spain", threshold_local_currency: null, currency: "EUR", threshold_eur_approx: null, regime: "No general exemption threshold", notes: "Spain has no general small business VAT exemption. All businesses must register from first invoice. Recargo de equivalencia for retailers." },
      FR: { country: "France", threshold_local_currency: 91900, currency: "EUR", threshold_eur_approx: 91900, regime: "Franchise en base de TVA", notes: "Goods: €91,900. Services: €36,800. Increased thresholds for liberal professions: €47,700." },
      DE: { country: "Germany", threshold_local_currency: 22000, currency: "EUR", threshold_eur_approx: 22000, regime: "Kleinunternehmerregelung (§19 UStG)", notes: "Previous year turnover ≤ €22,000 AND current year ≤ €50,000. From 2025: threshold raised to €25,000." },
      IT: { country: "Italy", threshold_local_currency: 85000, currency: "EUR", threshold_eur_approx: 85000, regime: "Regime forfettario", notes: "Flat-rate scheme for freelancers/small businesses with turnover ≤ €85,000. 5% or 15% flat tax rate." },
      NL: { country: "Netherlands", threshold_local_currency: 20000, currency: "EUR", threshold_eur_approx: 20000, regime: "Kleineondernemersregeling (KOR)", notes: "Optional exemption for businesses with annual turnover ≤ €20,000. Must apply to Belastingdienst." },
      BE: { country: "Belgium", threshold_local_currency: 25000, currency: "EUR", threshold_eur_approx: 25000, regime: "Franchise de la taxe / Vrijstellingsregeling", notes: "Threshold €25,000 (2024). Cannot deduct input VAT. Annual declaration still required." },
      UK: { country: "United Kingdom", threshold_local_currency: 90000, currency: "GBP", threshold_eur_approx: 105000, regime: "VAT Registration Threshold", notes: "Mandatory registration if turnover exceeds £90,000 (2024/25). Can register voluntarily below threshold." },
      SE: { country: "Sweden", threshold_local_currency: 120000, currency: "SEK", threshold_eur_approx: 10500, regime: "Undantag för småföretag", notes: "SEK 120,000 (~€10,500). EU SME scheme available for cross-border exemption from 2025." },
      PL: { country: "Poland", threshold_local_currency: 200000, currency: "PLN", threshold_eur_approx: 45000, regime: "Zwolnienie podmiotowe (Art. 113 VAT)", notes: "PLN 200,000 (~€45,000). Startups exempt in first year regardless of turnover." },
    };
    const code = country_code.toUpperCase();
    const data = thresholds[code];
    if (!data) { const r = { error: `Country ${code} not found. Available: ${Object.keys(thresholds).join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const r = { ...data, disclaimer: "Reference information only — not legal advice. Thresholds change annually. Verify with the relevant tax authority." };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 21. Get E-Invoicing Rules ──
  server.registerTool("get_einvoicing_rules", {
    description: "Returns the current e-invoicing (electronic invoicing) obligations for a given European country — whether mandatory for B2G, B2B, or B2C transactions, the required formats (FatturaPA, Factur-X, ZUGFeRD, XRechnung, PEPPOL BIS, UBL), and implementation timelines. Returns { country, b2g_mandatory, b2b_mandatory, b2c_mandatory, formats, platform, timeline, notes }. Supports 10 countries: IT, FR, DE, ES, PT, BE, NL, UK, SE, PL. Use when building invoice generation systems, determining compliance requirements for EU customers, or automating invoice submission workflows across Europe.",
    inputSchema: { country_code: z.string().describe("Two-letter ISO country code. Example: 'IT', 'DE', 'FR'") },
    outputSchema: { country: z.string().optional(), b2g_mandatory: z.boolean().optional(), b2b_mandatory: z.boolean().optional(), b2c_mandatory: z.boolean().optional(), formats: z.array(z.string()).optional(), platform: z.string().optional(), timeline: z.string().optional(), notes: z.string().optional(), disclaimer: z.string().optional(), error: z.string().optional() },
    annotations: { title: "Get E-Invoicing Rules", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code }) => {
    const rules = {
      IT: { country: "Italy", b2g_mandatory: true, b2b_mandatory: true, b2c_mandatory: true, formats: ["FatturaPA (XML)", "SDI"], platform: "SDI (Sistema di Interscambio)", timeline: "B2G: 2014. B2B+B2C: January 2019.", notes: "Most advanced e-invoicing system in EU. All invoices must pass through SDI. Codice destinatario required." },
      FR: { country: "France", b2g_mandatory: true, b2b_mandatory: true, b2c_mandatory: false, formats: ["Factur-X", "UBL 2.1", "CII"], platform: "Chorus Pro (B2G), PPF/PDP (B2B)", timeline: "B2G: 2017. B2B receipt: Sep 2026. B2B issuance: Sep 2026 (large) / Sep 2027 (SME).", notes: "Major reform. B2B mandatory from 2026-2027 depending on company size." },
      DE: { country: "Germany", b2g_mandatory: true, b2b_mandatory: true, b2c_mandatory: false, formats: ["XRechnung", "ZUGFeRD", "PEPPOL BIS"], platform: "PEPPOL network (B2G)", timeline: "B2G: Nov 2020. B2B receive: Jan 2025. B2B send: Jan 2027.", notes: "B2B e-invoicing mandatory from 2025 (receive) and 2027 (send). EN 16931 standard required." },
      ES: { country: "Spain", b2g_mandatory: true, b2b_mandatory: true, b2c_mandatory: false, formats: ["Facturae", "UBL", "PEPPOL"], platform: "FACe (B2G), Verifactu/SIF (B2B)", timeline: "B2G: 2015. B2B: 2025 (large companies), 2026 (SMEs) — Ley Crea y Crece.", notes: "Verifactu system being phased in. B2B mandatory pending final regulations." },
      PT: { country: "Portugal", b2g_mandatory: true, b2b_mandatory: false, b2c_mandatory: false, formats: ["CIUS-PT", "UBL 2.1", "PEPPOL"], platform: "eSPap / PEPPOL", timeline: "B2G: 2021. B2B: not yet mandatory.", notes: "ATCUD code mandatory on all invoices since 2023. Certified invoicing software required." },
      BE: { country: "Belgium", b2g_mandatory: true, b2b_mandatory: true, b2c_mandatory: false, formats: ["PEPPOL BIS", "UBL 2.1"], platform: "PEPPOL network", timeline: "B2G: 2020. B2B mandatory: Jan 2026.", notes: "B2B e-invoicing mandatory from January 2026 via PEPPOL network." },
      NL: { country: "Netherlands", b2g_mandatory: true, b2b_mandatory: false, b2c_mandatory: false, formats: ["PEPPOL BIS", "UBL 2.1"], platform: "PEPPOL network", timeline: "B2G: 2019. B2B: not yet mandatory.", notes: "Strong PEPPOL adoption. Government actively promotes voluntary B2B e-invoicing." },
      UK: { country: "United Kingdom", b2g_mandatory: false, b2b_mandatory: false, b2c_mandatory: false, formats: ["PEPPOL", "UBL"], platform: "No central platform", timeline: "No mandatory e-invoicing yet. HMRC consulting on introduction.", notes: "Post-Brexit, UK not bound by EU e-invoicing directive. Making Tax Digital (MTD) focuses on VAT records." },
      SE: { country: "Sweden", b2g_mandatory: true, b2b_mandatory: false, b2c_mandatory: false, formats: ["PEPPOL BIS", "Svefaktura"], platform: "PEPPOL network", timeline: "B2G: 2019 (central govt), 2021 (local govt). B2B: not mandatory.", notes: "Sweden has one of highest PEPPOL adoption rates in Europe." },
      PL: { country: "Poland", b2g_mandatory: true, b2b_mandatory: true, b2c_mandatory: false, formats: ["FA_VAT (XML)", "KSeF"], platform: "KSeF (Krajowy System e-Faktur)", timeline: "B2G: 2021. B2B mandatory: Feb 2026.", notes: "KSeF system. B2B e-invoicing mandatory from February 2026 after 2024 postponement." },
    };
    const code = country_code.toUpperCase();
    const data = rules[code];
    if (!data) { const r = { error: `Country ${code} not found. Available: ${Object.keys(rules).join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const r = { ...data, disclaimer: "Reference information only. E-invoicing regulations change frequently. Verify with official sources." };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ════════════════════════════════════════════════
  // MODULE 3 — LABOR HELPERS (3 tools)
  // ════════════════════════════════════════════════

  // ── 22. Get Public Holidays Range ──
  server.registerTool("get_public_holidays_range", {
    description: "Returns all public holidays that fall within a given date range for a specified European country, including fixed holidays and Easter-based moveable holidays. Returns { country, start_date, end_date, total_holidays, holidays: [{date, name, name_en}] }. Supports 8 countries: PT, ES, FR, DE, IT, NL, BE, UK. Use when calculating SLA periods, project timelines, delivery windows, or any workflow that must skip non-working days across multiple European countries.",
    inputSchema: {
      country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'FR'"),
      start_date: z.string().describe("Start date in YYYY-MM-DD format. Example: '2026-01-01'"),
      end_date: z.string().describe("End date in YYYY-MM-DD format. Example: '2026-12-31'")
    },
    outputSchema: { country: z.string().optional(), start_date: z.string().optional(), end_date: z.string().optional(), total_holidays: z.number().optional(), holidays: z.array(z.object({ date: z.string(), name: z.string(), name_en: z.string() })).optional(), error: z.string().optional() },
    annotations: { title: "Get Public Holidays in Date Range", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code, start_date, end_date }) => {
    const start = new Date(start_date), end = new Date(end_date);
    if (isNaN(start) || isNaN(end)) { const r = { error: "Invalid date format. Use YYYY-MM-DD" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const code = country_code.toUpperCase();
    const supported = ["PT", "ES", "FR", "DE", "IT", "NL", "BE", "UK"];
    if (!supported.includes(code)) { const r = { error: `Country ${code} not supported. Supported: ${supported.join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }

    const fixedNames = {
      PT: { "01-01": ["Ano Novo","New Year's Day"], "04-25": ["Dia da Liberdade","Freedom Day"], "05-01": ["Dia do Trabalhador","Labour Day"], "06-10": ["Dia de Portugal","Portugal Day"], "08-15": ["Assunção","Assumption of Mary"], "10-05": ["Implantação da República","Republic Day"], "11-01": ["Todos os Santos","All Saints Day"], "12-01": ["Restauração da Independência","Independence Day"], "12-08": ["Imaculada Conceição","Immaculate Conception"], "12-25": ["Natal","Christmas Day"] },
      ES: { "01-01": ["Año Nuevo","New Year's Day"], "01-06": ["Epifanía","Epiphany"], "05-01": ["Día del Trabajo","Labour Day"], "08-15": ["Asunción","Assumption of Mary"], "10-12": ["Fiesta Nacional","National Day"], "11-01": ["Todos los Santos","All Saints Day"], "12-06": ["Constitución","Constitution Day"], "12-08": ["Inmaculada Concepción","Immaculate Conception"], "12-25": ["Navidad","Christmas Day"] },
      FR: { "01-01": ["Jour de l'An","New Year's Day"], "05-01": ["Fête du Travail","Labour Day"], "05-08": ["Victoire 1945","Victory in Europe Day"], "07-14": ["Fête Nationale","Bastille Day"], "08-15": ["Assomption","Assumption of Mary"], "11-01": ["Toussaint","All Saints Day"], "11-11": ["Armistice","Armistice Day"], "12-25": ["Noël","Christmas Day"] },
      DE: { "01-01": ["Neujahr","New Year's Day"], "05-01": ["Tag der Arbeit","Labour Day"], "10-03": ["Tag der Deutschen Einheit","German Unity Day"], "12-25": ["Erster Weihnachtstag","Christmas Day"], "12-26": ["Zweiter Weihnachtstag","Boxing Day"] },
      IT: { "01-01": ["Capodanno","New Year's Day"], "01-06": ["Epifania","Epiphany"], "04-25": ["Festa della Liberazione","Liberation Day"], "05-01": ["Festa del Lavoro","Labour Day"], "06-02": ["Festa della Repubblica","Republic Day"], "08-15": ["Ferragosto","Assumption of Mary"], "11-01": ["Ognissanti","All Saints Day"], "12-08": ["Immacolata Concezione","Immaculate Conception"], "12-25": ["Natale","Christmas Day"], "12-26": ["Santo Stefano","St Stephen's Day"] },
      NL: { "01-01": ["Nieuwjaarsdag","New Year's Day"], "04-27": ["Koningsdag","King's Day"], "05-05": ["Bevrijdingsdag","Liberation Day"], "12-25": ["Eerste Kerstdag","Christmas Day"], "12-26": ["Tweede Kerstdag","Boxing Day"] },
      BE: { "01-01": ["Jour de l'An","New Year's Day"], "05-01": ["Fête du Travail","Labour Day"], "07-21": ["Fête Nationale","National Day"], "08-15": ["Assomption","Assumption of Mary"], "11-01": ["Toussaint","All Saints Day"], "11-11": ["Armistice","Armistice Day"], "12-25": ["Noël","Christmas Day"] },
      UK: { "01-01": ["New Year's Day","New Year's Day"], "12-25": ["Christmas Day","Christmas Day"], "12-26": ["Boxing Day","Boxing Day"] },
    };

    const moveableNames = {
      PT: { offsets: { "-2": ["Sexta-feira Santa","Good Friday"] } },
      ES: { offsets: { "-2": ["Viernes Santo","Good Friday"] } },
      FR: { offsets: { "1": ["Lundi de Pâques","Easter Monday"], "39": ["Ascension","Ascension Day"], "50": ["Lundi de Pentecôte","Whit Monday"] } },
      DE: { offsets: { "-2": ["Karfreitag","Good Friday"], "1": ["Ostermontag","Easter Monday"], "39": ["Himmelfahrt","Ascension Day"], "50": ["Pfingstmontag","Whit Monday"] } },
      IT: { offsets: { "1": ["Pasquetta","Easter Monday"] } },
      NL: { offsets: { "-2": ["Goede Vrijdag","Good Friday"], "1": ["Tweede Paasdag","Easter Monday"], "39": ["Hemelvaartsdag","Ascension Day"], "50": ["Tweede Pinksterdag","Whit Monday"] } },
      BE: { offsets: { "1": ["Lundi de Pâques","Easter Monday"], "39": ["Ascension","Ascension Day"], "50": ["Lundi de Pentecôte","Whit Monday"] } },
      UK: { offsets: { "-2": ["Good Friday","Good Friday"], "1": ["Easter Monday","Easter Monday"] } },
    };

    let allHolidays = [];
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const fixed = fixedNames[code] || {};
      for (const [mmdd, names] of Object.entries(fixed)) {
        allHolidays.push({ date: `${y}-${mmdd}`, name: names[0], name_en: names[1] });
      }
      const easter = getEaster(y);
      const moveable = moveableNames[code]?.offsets || {};
      for (const [offset, names] of Object.entries(moveable)) {
        allHolidays.push({ date: fmt(addDays(easter, parseInt(offset))), name: names[0], name_en: names[1] });
      }
    }

    const filtered = allHolidays.filter(h => {
      const d = new Date(h.date);
      return d >= start && d <= end;
    }).sort((a, b) => a.date.localeCompare(b.date));

    const r = { country: code, start_date, end_date, total_holidays: filtered.length, holidays: filtered };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 23. Calculate Working Days EU ──
  server.registerTool("calculate_working_days_eu", {
    description: "Counts the number of working days between two dates (inclusive) for a given European country, excluding weekends and that country's national public holidays (fixed and Easter-based moveable). Returns { country, start_date, end_date, working_days, holidays_excluded }. Supports 8 countries: PT, ES, FR, DE, IT, NL, BE, UK. Use when calculating cross-border SLA periods, invoice payment deadlines, or project timelines that must account for different national holiday calendars across Europe.",
    inputSchema: {
      country_code: z.string().describe("Two-letter ISO country code. Example: 'DE', 'IT', 'UK'"),
      start_date: z.string().describe("Start date in YYYY-MM-DD format, inclusive. Example: '2026-01-01'"),
      end_date: z.string().describe("End date in YYYY-MM-DD format, inclusive. Example: '2026-01-31'")
    },
    outputSchema: { country: z.string().optional(), start_date: z.string().optional(), end_date: z.string().optional(), working_days: z.number().optional(), holidays_excluded: z.number().optional(), error: z.string().optional() },
    annotations: { title: "Calculate Working Days (EU Multi-Country)", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code, start_date, end_date }) => {
    const code = country_code.toUpperCase();
    const supported = ["PT", "ES", "FR", "DE", "IT", "NL", "BE", "UK"];
    if (!supported.includes(code)) { const r = { error: `Country ${code} not supported. Supported: ${supported.join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    const start = new Date(start_date), end = new Date(end_date);
    if (isNaN(start) || isNaN(end)) { const r = { error: "Invalid date format. Use YYYY-MM-DD" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }

    const fixed = FIXED_HOLIDAYS[code] || [];
    const moveableByYear = {};
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) moveableByYear[y] = getMoveableHolidayDates(y, code);

    let count = 0, holidaysExcluded = 0;
    const current = new Date(start);

    while (current <= end) {
      const dow = current.getDay();
      const mmdd = `${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      const fullDate = fmt(current);
      const isHoliday = fixed.includes(mmdd) || (moveableByYear[current.getFullYear()] || []).includes(fullDate);
      if (dow !== 0 && dow !== 6 && !isHoliday) count++;
      else if (dow !== 0 && dow !== 6 && isHoliday) holidaysExcluded++;
      current.setDate(current.getDate() + 1);
    }

    const r = { country: code, start_date, end_date, working_days: count, holidays_excluded: holidaysExcluded };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 24. Get Next Payment Date ──
  server.registerTool("get_next_payment_date", {
    description: "Calculates the next valid payment date based on a reference date and a payment rule for a given European country, skipping weekends and national public holidays (fixed and Easter-based). Supports rules: 'last_working_day_of_month' (salary payment), 'first_working_day_of_month', 'nth_working_day' (e.g. 5th working day), 'next_working_day' (next business day after reference). Returns { country, reference_date, rule, n, result_date }. Supports 8 countries: PT, ES, FR, DE, IT, NL, BE, UK. Use when scheduling salary payments, invoice due dates, or any automated payment workflow that must avoid non-working days.",
    inputSchema: {
      country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'FR'"),
      reference_date: z.string().describe("Reference date in YYYY-MM-DD format. Example: '2026-01-31'"),
      rule: z.enum(["last_working_day_of_month", "first_working_day_of_month", "next_working_day", "nth_working_day"]).describe("Payment rule to apply."),
      n: z.number().optional().describe("For nth_working_day rule: which working day of the month. Example: 5 for 5th working day.")
    },
    outputSchema: { country: z.string().optional(), reference_date: z.string().optional(), rule: z.string().optional(), n: z.number().nullable().optional(), result_date: z.string().optional(), error: z.string().optional() },
    annotations: { title: "Get Next Payment Date", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code, reference_date, rule, n }) => {
    const code = country_code.toUpperCase();
    const supported = ["PT", "ES", "FR", "DE", "IT", "NL", "BE", "UK"];
    if (!supported.includes(code)) { const r = { error: `Country ${code} not supported. Supported: ${supported.join(", ")}` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }

    const fixed = FIXED_HOLIDAYS[code] || [];
    const moveableCache = {};
    const getMoveable = (y) => {
      if (!moveableCache[y]) moveableCache[y] = getMoveableHolidayDates(y, code);
      return moveableCache[y];
    };

    const isWorkingDay = (date) => {
      const dow = date.getDay();
      if (dow === 0 || dow === 6) return false;
      const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (fixed.includes(mmdd)) return false;
      if (getMoveable(date.getFullYear()).includes(fmt(date))) return false;
      return true;
    };

    const ref = new Date(reference_date);
    if (isNaN(ref)) { const r = { error: "Invalid date format. Use YYYY-MM-DD" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }

    let resultDate;
    if (rule === "next_working_day") {
      const d = new Date(ref); d.setDate(d.getDate() + 1);
      while (!isWorkingDay(d)) d.setDate(d.getDate() + 1);
      resultDate = fmt(d);
    }
    if (rule === "last_working_day_of_month") {
      const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      while (!isWorkingDay(d)) d.setDate(d.getDate() - 1);
      resultDate = fmt(d);
    }
    if (rule === "first_working_day_of_month") {
      const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
      while (!isWorkingDay(d)) d.setDate(d.getDate() + 1);
      resultDate = fmt(d);
    }
    if (rule === "nth_working_day") {
      if (!n || n < 1) { const r = { error: "For nth_working_day rule, provide n >= 1" }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
      const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
      let count = 0;
      let found = false;
      while (true) {
        if (isWorkingDay(d)) {
          count++;
          if (count === n) { found = true; break; }
        }
        d.setDate(d.getDate() + 1);
        if (d.getMonth() !== ref.getMonth()) break;
      }
      if (!found) { const r = { error: `Month does not have ${n} working days` }; return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
      resultDate = fmt(d);
    }

    const r = { country: code, reference_date, rule, n: n || null, result_date: resultDate };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ════════════════════════════════════════════════
  // MODULE 4 — INVOICE & VAT HELPER (4 tools)
  // ════════════════════════════════════════════════

  // ── 25. Validate Invoice Schema ──
  server.registerTool("validate_invoice_schema", {
    description: "Validates whether an invoice JSON object contains all mandatory fields required for a valid VAT invoice in a given European country, based on EU VAT Directive 2006/112/EC and local implementations. Performs structural validation (missing fields), arithmetic checks (total_excl_vat + vat_amount = total_incl_vat, vat_amount = total_excl_vat × vat_rate / 100), and country-specific warnings (Italy SDI codice destinatario, Portugal ATCUD code). Returns { valid: boolean, country, missing_fields: [], present_fields: [], warnings: [] }. Use when building invoice generation pipelines, pre-submission validation, or compliance checks in agent workflows.",
    inputSchema: {
      country_code: z.string().describe("Two-letter ISO country code. Example: 'PT', 'DE', 'IT'"),
      invoice: z.object({
        invoice_number: z.string().optional(),
        invoice_date: z.string().optional(),
        supplier_name: z.string().optional(),
        supplier_tax_id: z.string().optional(),
        customer_name: z.string().optional(),
        customer_tax_id: z.string().optional(),
        line_items: z.array(z.any()).optional(),
        vat_rate: z.number().optional(),
        vat_amount: z.number().optional(),
        total_excl_vat: z.number().optional(),
        total_incl_vat: z.number().optional(),
        currency: z.string().optional(),
        sdi_code: z.string().optional(),
        atcud: z.string().optional(),
      }).describe("Invoice object to validate")
    },
    outputSchema: { valid: z.boolean(), country: z.string().optional(), missing_fields: z.array(z.string()).optional(), present_fields: z.array(z.string()).optional(), warnings: z.array(z.string()).optional(), disclaimer: z.string().optional() },
    annotations: { title: "Validate Invoice Schema", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ country_code, invoice }) => {
    const baseRequired = ["invoice_number", "invoice_date", "supplier_name", "supplier_tax_id", "customer_name", "line_items", "vat_rate", "vat_amount", "total_excl_vat", "total_incl_vat"];
    const countryExtra = {
      PT: ["customer_tax_id"],
      ES: ["customer_tax_id"],
      IT: ["customer_tax_id"],
      FR: ["customer_tax_id"],
      DE: [],
      NL: [],
      BE: ["customer_tax_id"],
      UK: [],
    };
    const code = country_code.toUpperCase();
    const extraRequired = countryExtra[code] || [];
    const allRequired = [...new Set([...baseRequired, ...extraRequired])];

    const missingFields = allRequired.filter(f => invoice[f] === undefined || invoice[f] === null || invoice[f] === "");
    const presentFields = allRequired.filter(f => invoice[f] !== undefined && invoice[f] !== null && invoice[f] !== "");

    const warnings = [];
    if (invoice.total_incl_vat && invoice.total_excl_vat && invoice.vat_amount) {
      const calculated = Math.round((invoice.total_excl_vat + invoice.vat_amount) * 100) / 100;
      if (Math.abs(calculated - invoice.total_incl_vat) > 0.02) {
        warnings.push(`Total including VAT (${invoice.total_incl_vat}) does not match total excl. VAT + VAT amount (${calculated})`);
      }
    }
    if (invoice.vat_rate !== undefined && invoice.total_excl_vat && invoice.vat_amount) {
      const expectedVat = Math.round(invoice.total_excl_vat * invoice.vat_rate / 100 * 100) / 100;
      if (Math.abs(expectedVat - invoice.vat_amount) > 0.02) {
        warnings.push(`VAT amount (${invoice.vat_amount}) does not match expected VAT at ${invoice.vat_rate}% of ${invoice.total_excl_vat} (expected: ${expectedVat})`);
      }
    }
    if (code === "IT" && !invoice.sdi_code) warnings.push("Italy: SDI recipient code (codice destinatario) is required for e-invoicing via SDI system");
    if (code === "PT" && !invoice.atcud) warnings.push("Portugal: ATCUD code is mandatory on all invoices since 2023");

    const r = { valid: missingFields.length === 0, country: code, missing_fields: missingFields, present_fields: presentFields, warnings, disclaimer: "Reference validation only — not legal advice." };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 26. Calculate VAT Breakdown ──
  server.registerTool("calculate_vat_breakdown", {
    description: "Calculates a complete VAT breakdown for a list of invoice line items, grouping amounts by VAT rate and computing totals. Returns { lines_summary, vat_breakdown: [{rate, base_amount, vat_amount}], total_excl_vat, total_vat, total_incl_vat, currency }. Each line item requires { description, quantity, unit_price, vat_rate }. Handles multiple VAT rates per invoice (e.g. mixed standard 23% + reduced 6% items) and rounds to specified decimal places. Use when generating invoices, building checkout summaries, or verifying VAT calculations in agent workflows.",
    inputSchema: {
      lines: z.array(z.object({
        description: z.string().describe("Item description"),
        quantity: z.number().describe("Quantity"),
        unit_price: z.number().describe("Unit price excluding VAT"),
        vat_rate: z.number().describe("VAT rate as percentage. Example: 23 for 23%")
      })).describe("Array of invoice line items"),
      currency: z.string().optional().describe("Currency code. Example: 'EUR', 'GBP'. Defaults to 'EUR'"),
      round_decimals: z.number().optional().describe("Decimal places for rounding. Defaults to 2")
    },
    outputSchema: { lines_summary: z.array(z.any()), vat_breakdown: z.array(z.object({ rate: z.number(), base_amount: z.number(), vat_amount: z.number() })), total_excl_vat: z.number(), total_vat: z.number(), total_incl_vat: z.number(), currency: z.string() },
    annotations: { title: "Calculate VAT Breakdown", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ lines, currency = "EUR", round_decimals = 2 }) => {
    const round = (n) => Math.round(n * Math.pow(10, round_decimals)) / Math.pow(10, round_decimals);
    const vatGroups = {};
    const linesSummary = lines.map(line => {
      const lineTotal = round(line.quantity * line.unit_price);
      const lineVat = round(lineTotal * line.vat_rate / 100);
      const lineTotalIncl = round(lineTotal + lineVat);
      if (!vatGroups[line.vat_rate]) vatGroups[line.vat_rate] = { base: 0, vat: 0 };
      vatGroups[line.vat_rate].base = round(vatGroups[line.vat_rate].base + lineTotal);
      vatGroups[line.vat_rate].vat = round(vatGroups[line.vat_rate].vat + lineVat);
      return { description: line.description, quantity: line.quantity, unit_price: line.unit_price, vat_rate: line.vat_rate, line_total_excl_vat: lineTotal, line_vat: lineVat, line_total_incl_vat: lineTotalIncl };
    });
    const vatBreakdown = Object.entries(vatGroups).map(([rate, amounts]) => ({ rate: parseFloat(rate), base_amount: amounts.base, vat_amount: amounts.vat }));
    const totalExclVat = round(linesSummary.reduce((s, l) => s + l.line_total_excl_vat, 0));
    const totalVat = round(linesSummary.reduce((s, l) => s + l.line_vat, 0));
    const totalInclVat = round(totalExclVat + totalVat);
    const r = { lines_summary: linesSummary, vat_breakdown: vatBreakdown, total_excl_vat: totalExclVat, total_vat: totalVat, total_incl_vat: totalInclVat, currency };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 27. Suggest VAT Treatment ──
  server.registerTool("suggest_vat_treatment", {
    description: "Suggests the likely VAT treatment for a transaction based on seller country, buyer country, buyer VAT registration status, and goods/services type — covering standard VAT, reverse charge, OSS/IOSS, and zero-rating scenarios under EU VAT rules. Returns { treatment, description, seller_charges_vat, applicable_rate, notes, disclaimer }. Handles 6 distinct scenarios: domestic, intra-EU B2B reverse charge, intra-EU B2C with OSS for digital services, intra-EU B2C goods with €10,000 threshold, exports to non-EU (zero-rated), imports from non-EU. Post-Brexit UK is treated as third country. Use when building checkout VAT logic, invoice generation, or cross-border EU compliance workflows.",
    inputSchema: {
      seller_country: z.string().describe("Seller's country ISO code. Example: 'PT'"),
      buyer_country: z.string().describe("Buyer's country ISO code. Example: 'DE'"),
      buyer_is_vat_registered: z.boolean().describe("Whether the buyer is VAT registered (B2B) or not (B2C)"),
      goods_type: z.enum(["goods", "digital_services", "services"]).describe("Type of supply")
    },
    outputSchema: { treatment: z.string(), description: z.string(), seller_charges_vat: z.boolean(), applicable_rate: z.string(), seller_country: z.string(), buyer_country: z.string(), buyer_is_vat_registered: z.boolean(), goods_type: z.string(), notes: z.string(), disclaimer: z.string() },
    annotations: { title: "Suggest VAT Treatment", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ seller_country, buyer_country, buyer_is_vat_registered, goods_type }) => {
    const seller = seller_country.toUpperCase();
    const buyer = buyer_country.toUpperCase();
    const euCountries = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
    const sellerInEU = euCountries.includes(seller);
    const buyerInEU = euCountries.includes(buyer);

    let treatment, description, sellerChargesVat, applicableRate, notes;

    if (seller === buyer) {
      treatment = "domestic_vat";
      description = "Domestic transaction — standard VAT of seller country applies";
      sellerChargesVat = true;
      applicableRate = "Seller country standard/reduced rate";
      notes = `Apply ${seller} VAT rates. Standard transaction.`;
    } else if (sellerInEU && buyerInEU && buyer_is_vat_registered) {
      treatment = "intra_eu_b2b_reverse_charge";
      description = "Intra-EU B2B supply — reverse charge mechanism applies";
      sellerChargesVat = false;
      applicableRate = "0% (zero-rated at source)";
      notes = `Seller issues zero-rated invoice. Buyer self-accounts for VAT in ${buyer} at local rate. Seller must quote buyer's VAT number on invoice.`;
    } else if (sellerInEU && buyerInEU && !buyer_is_vat_registered) {
      if (goods_type === "digital_services") {
        treatment = "oss_digital_services";
        description = "Intra-EU B2C digital services — OSS (One Stop Shop) scheme";
        sellerChargesVat = true;
        applicableRate = `${buyer} country rate for digital services`;
        notes = `VAT charged at buyer's country rate. Declare and pay via OSS scheme. No need to register in ${buyer} if using OSS.`;
      } else if (goods_type === "goods") {
        treatment = "eu_distance_sales";
        description = "Intra-EU B2C goods — distance selling rules / OSS";
        sellerChargesVat = true;
        applicableRate = `${buyer} country rate (if above €10,000 EU threshold)`;
        notes = `Below €10,000 annual EU B2C threshold: apply seller country VAT. Above threshold: apply buyer country VAT via OSS.`;
      } else {
        treatment = "b2c_services_seller_country";
        description = "Intra-EU B2C services — general rule: seller country VAT";
        sellerChargesVat = true;
        applicableRate = `${seller} country rate`;
        notes = "General rule for B2C services: place of supply is seller's country. Exceptions apply for specific service types (transport, cultural, etc.).";
      }
    } else if (sellerInEU && !buyerInEU) {
      treatment = "export_zero_rated";
      description = "Export outside EU — zero-rated supply";
      sellerChargesVat = false;
      applicableRate = "0% (export)";
      notes = `Supply to ${buyer} outside EU. Zero-rated export. Seller must retain export documentation. ${buyer === "UK" || buyer === "GB" ? "Post-Brexit: UK is treated as third country." : ""}`;
    } else if (!sellerInEU && buyerInEU) {
      treatment = "import_buyer_accounts";
      description = "Import from outside EU — buyer accounts for import VAT";
      sellerChargesVat = false;
      applicableRate = `${buyer} import VAT rate`;
      notes = `Goods/services from outside EU. ${buyer} import VAT applies. For digital services B2C: seller may need to register for IOSS.`;
    } else {
      treatment = "outside_eu_scope";
      description = "Transaction outside EU VAT scope";
      sellerChargesVat = false;
      applicableRate = "N/A";
      notes = "Neither seller nor buyer is in the EU. EU VAT rules do not apply.";
    }

    const r = { treatment, description, seller_charges_vat: sellerChargesVat, applicable_rate: applicableRate, seller_country: seller, buyer_country: buyer, buyer_is_vat_registered, goods_type, notes, disclaimer: "Reference information only — not legal or tax advice. Always verify with a qualified tax advisor for real transactions." };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  // ── 28. Calculate VAT Amount ──
  server.registerTool("calculate_vat_amount", {
    description: "Calculates VAT amounts from either a net (excluding VAT) or gross (including VAT) amount for a given VAT rate. Returns { net_amount, vat_amount, gross_amount, vat_rate, currency }. Use when building pricing tools, invoice calculators, or checkout flows that need to split gross prices into net + VAT components. All values rounded to 2 decimal places.",
    inputSchema: {
      amount: z.number().describe("The amount to calculate VAT for"),
      vat_rate: z.number().describe("VAT rate as a percentage. Example: 23 for 23%"),
      amount_type: z.enum(["net", "gross"]).describe("Whether the input amount is net (excluding VAT) or gross (including VAT)"),
      currency: z.string().optional().describe("Currency code. Example: 'EUR', 'GBP'. Defaults to 'EUR'")
    },
    outputSchema: { net_amount: z.number(), vat_amount: z.number(), gross_amount: z.number(), vat_rate: z.number(), currency: z.string() },
    annotations: { title: "Calculate VAT Amount", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }, async ({ amount, vat_rate, amount_type, currency = "EUR" }) => {
    const round = (n) => Math.round(n * 100) / 100;
    let net, vat, gross;
    if (amount_type === "net") {
      net = round(amount);
      vat = round(amount * vat_rate / 100);
      gross = round(net + vat);
    } else {
      gross = round(amount);
      net = round(amount / (1 + vat_rate / 100));
      vat = round(gross - net);
    }
    const r = { net_amount: net, vat_amount: vat, gross_amount: gross, vat_rate, currency };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  });

  return server;
};

// ════════════════════════════════════════════════
// DUAL TRANSPORT: stdio (Glama/local) or HTTP (Railway/production)
// ════════════════════════════════════════════════

const isStdio = process.env.MCP_HTTP !== "true";

if (isStdio) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "mcp-europe-business",
        version: "1.2.0",
        description: "European business compliance suite for AI agents",
        tools_count: 28,
        modules: {
          validation: ["validate_nif", "validate_iban", "get_vat_rate", "get_portugal_holidays", "get_spain_holidays", "get_france_holidays", "validate_nif_es", "validate_siret", "validate_tva_fr", "calculate_working_days", "format_number_european", "validate_codice_fiscale", "validate_partita_iva", "validate_vat_de", "validate_vat_uk", "validate_kvk_nl", "validate_postal_code"],
          business_rules: ["get_payment_terms", "get_invoice_requirements", "get_vat_exemption_threshold", "get_einvoicing_rules"],
          labor_helpers: ["get_public_holidays_range", "calculate_working_days_eu", "get_next_payment_date"],
          invoice_vat: ["validate_invoice_schema", "calculate_vat_breakdown", "suggest_vat_treatment", "calculate_vat_amount"]
        },
        mcp_endpoint: "/mcp"
      }));
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/mcp") {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  const PORT = process.env.PORT || 8080;
  httpServer.listen(PORT, () => {
    console.log(`MCP Europe Business Suite v1.2.0 running on port ${PORT}`);
  });
}
