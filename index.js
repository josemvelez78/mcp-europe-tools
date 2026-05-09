import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "http";

const createServer = () => {
  const server = new McpServer({
    name: "mcp-europe-tools",
    version: "1.2.2",
    description: "Essential European data validation and formatting tools for AI agents working with Portuguese, Spanish, French and European business data. Covers NIF/NIE/CIF validation, SIRET/TVA validation, IBAN verification, VAT rates, public holidays and number formatting for 18+ European countries."
  });

  // ── FERRAMENTA 1: Validar NIF Português ──
  server.registerTool(
    "validate_nif",
    {
      description: "Validates a Portuguese NIF (Número de Identificação Fiscal) — the 9-digit tax identification number issued by the Portuguese Tax Authority (AT) to individuals and companies. Applies the official modulo-11 checksum algorithm to verify the check digit. Returns { valid: true, nif: string } for valid NIFs, or { valid: false, reason: string } for invalid format or failed checksum. First-digit rules are enforced: 1–3 for individuals, 5 for corporations, 6 for public entities, 7–8 for other entities, 9 for occasional taxpayers. Use when processing Portuguese invoices (faturas), onboarding suppliers, validating user registrations, or any fiscal compliance workflow. Does not query the AT database — offline format and checksum validation only.",
      inputSchema: { nif: z.string().describe("9-digit Portuguese NIF, with or without spaces. Example: '123456789' or '123 456 789'") },
      annotations: { title: "Validate Portuguese NIF", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ nif }) => {
      const clean = nif.replace(/\s/g, "");
      if (!/^\d{9}$/.test(clean)) {
        return { content: [{ type: "text", text: JSON.stringify({ valid: false, reason: "NIF must have exactly 9 digits" }) }] };
      }
      const validFirst = [1,2,3,5,6,7,8,9];
      if (!validFirst.includes(parseInt(clean[0]))) {
        return { content: [{ type: "text", text: JSON.stringify({ valid: false, reason: "Invalid first digit" }) }] };
      }
      let sum = 0;
      for (let i = 0; i < 8; i++) {
        sum += parseInt(clean[i]) * (9 - i);
      }
      const remainder = sum % 11;
      const checkDigit = remainder < 2 ? 0 : 11 - remainder;
      const valid = checkDigit === parseInt(clean[8]);
      return { content: [{ type: "text", text: JSON.stringify({ valid, nif: clean }) }] };
    }
  );

  // ── FERRAMENTA 2: Validar IBAN ──
  server.registerTool(
    "validate_iban",
    {
      description: "Validates an IBAN (International Bank Account Number) using the ISO 13616 MOD-97 algorithm. Supports 18 European countries: PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR. Returns { valid: boolean, country: string, iban: string } — country is extracted from the 2-letter prefix. Returns { valid: false, reason: string } for malformed input. Spaces are automatically stripped before validation. Use when validating supplier bank details for SEPA transfers, processing direct debit mandates, verifying payment data in e-commerce checkouts, or any workflow requiring a verified EU bank account number. Validates structure and checksum only — does not confirm account existence.",
      inputSchema: { iban: z.string().describe("European IBAN with or without spaces. Example: 'PT50 0002 0123 1234 5678 9015 4' or 'PT50000201231234567890154'") },
      annotations: { title: "Validate IBAN", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ iban }) => {
      const clean = iban.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) {
        return { content: [{ type: "text", text: JSON.stringify({ valid: false, reason: "Invalid IBAN format" }) }] };
      }
      const rearranged = clean.slice(4) + clean.slice(0, 4);
      const numeric = rearranged.split("").map(c => isNaN(c) ? (c.charCodeAt(0) - 55).toString() : c).join("");
      let remainder = 0;
      for (let i = 0; i < numeric.length; i++) {
        remainder = (remainder * 10 + parseInt(numeric[i])) % 97;
      }
      const valid = remainder === 1;
      const country = clean.slice(0, 2);
      return { content: [{ type: "text", text: JSON.stringify({ valid, country, iban: clean }) }] };
    }
  );

  // ── FERRAMENTA 3: Taxas de IVA Europeias ──
  server.registerTool(
    "get_vat_rate",
    {
      description: "Returns all VAT (Value Added Tax) rates for a given EU country — standard, reduced, intermediate, and super-reduced rates where applicable, as numeric percentages. Returns { country, standard, reduced?, intermediate?, superreduced? } for supported countries, or { error, available } listing all valid codes if the country is not found. Supports 18 EU member states: PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR. Use when calculating EU cross-border invoice tax, determining correct rate for e-commerce checkout by customer country, generating compliant VAT breakdowns, or any workflow requiring accurate and current EU VAT rates per jurisdiction.",
      inputSchema: { country_code: z.string().describe("Two-letter ISO 3166-1 alpha-2 country code. Example: 'PT' for Portugal, 'FR' for France, 'DE' for Germany") },
      annotations: { title: "Get EU VAT Rate", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ country_code }) => {
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
      };
      const code = country_code.toUpperCase();
      const data = rates[code];
      if (!data) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Country ${code} not found. Available: ${Object.keys(rates).join(", ")}` }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
  );

  // ── FERRAMENTA 4: Feriados Portugueses ──
  server.registerTool(
    "get_portugal_holidays",
    {
      description: "Returns all Portuguese national public holidays for a given year as a structured list. Each holiday includes { date: 'YYYY-MM-DD', name: string, name_en: string }. Returns 10 mandatory national holidays defined by Portuguese law. Use when calculating business deadlines, delivery dates, payment due dates, SLA periods, or scheduling tasks that must avoid non-working days in Portugal. Does not include municipal or regional holidays (e.g. Lisbon June 13, Porto June 24) which vary by city.",
      inputSchema: { year: z.number().describe("Calendar year as a 4-digit integer. Example: 2026") },
      annotations: { title: "Get Portugal Public Holidays", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ year }) => {
      const holidays = [
        { date: `${year}-01-01`, name: "Ano Novo", name_en: "New Year's Day" },
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
      return { content: [{ type: "text", text: JSON.stringify({ year, country: "Portugal", total_holidays: holidays.length, holidays }) }] };
    }
  );

  // ── FERRAMENTA 5: Formatar Número Europeu ──
  server.registerTool(
    "format_number_european",
    {
      description: "Formats a number using the locale conventions of a specific European country, applying the correct decimal separator and thousands separator. Returns { original: number, formatted: string, locale: string, country_code: string }. Different European countries use different conventions — Portugal and most of continental Europe use '1.234,56' (dot as thousands, comma as decimal), while Ireland uses '1,234.56'. Supports PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO. Use when displaying prices, measurements, or any numeric value to end users in a specific European country.",
      inputSchema: {
        number: z.number().describe("The numeric value to format. Example: 1234.56"),
        country_code: z.string().describe("Two-letter country code for the target locale. Example: 'PT', 'FR', 'DE'"),
        decimals: z.number().optional().describe("Number of decimal places. Defaults to 2. Use 0 for whole numbers, 2 for prices.")
      },
      annotations: { title: "Format Number European Locale", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ number, country_code, decimals = 2 }) => {
      const localeMap = {
        PT: "pt-PT", ES: "es-ES", FR: "fr-FR", DE: "de-DE",
        IT: "it-IT", NL: "nl-NL", BE: "fr-BE", PL: "pl-PL",
        SE: "sv-SE", DK: "da-DK", FI: "fi-FI", AT: "de-AT",
        IE: "en-IE", GR: "el-GR", HU: "hu-HU", RO: "ro-RO"
      };
      const locale = localeMap[country_code.toUpperCase()] || "pt-PT";
      const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(number);
      return { content: [{ type: "text", text: JSON.stringify({ original: number, formatted, locale, country_code }) }] };
    }
  );

  // ── FERRAMENTA 6: Validar NIF/NIE/CIF Espanhol ──
  server.registerTool(
    "validate_nif_es",
    {
      description: "Validates Spanish tax identification numbers — NIF (DNI, 8 digits + check letter, for Spanish citizens), NIE (Número de Identidad de Extranjero, starts with X/Y/Z, for foreign residents), and CIF (Código de Identificación Fiscal, letter + 7 digits + control, for companies). Automatically detects the document type. Returns { valid: boolean, type: 'NIF'|'NIE'|'CIF', id: string }. Use when processing Spanish invoices, e-commerce orders, supplier registrations, or any document requiring a verified Spanish fiscal identifier.",
      inputSchema: { id: z.string().describe("Spanish NIF, NIE or CIF with or without spaces. Examples: '12345678Z' (NIF), 'X1234567L' (NIE), 'B12345678' (CIF)") },
      annotations: { title: "Validate Spanish NIF / NIE / CIF", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ id }) => {
      const clean = id.replace(/\s/g, "").toUpperCase();
      const nifLetters = "TRWAGMYFPDXBNJZSQVHLCKE";
      if (/^\d{8}[A-Z]$/.test(clean)) {
        const number = parseInt(clean.slice(0, 8));
        const letter = clean[8];
        const expected = nifLetters[number % 23];
        const valid = letter === expected;
        return { content: [{ type: "text", text: JSON.stringify({ valid, type: "NIF", id: clean }) }] };
      }
      if (/^[XYZ]\d{7}[A-Z]$/.test(clean)) {
        const nieMap = { X: "0", Y: "1", Z: "2" };
        const replaced = nieMap[clean[0]] + clean.slice(1, 8);
        const number = parseInt(replaced);
        const letter = clean[8];
        const expected = nifLetters[number % 23];
        const valid = letter === expected;
        return { content: [{ type: "text", text: JSON.stringify({ valid, type: "NIE", id: clean }) }] };
      }
      if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(clean)) {
        const letters = "JABCDEFGHI";
        let sumOdd = 0;
        let sumEven = 0;
        for (let i = 1; i <= 7; i++) {
          const digit = parseInt(clean[i]);
          if (i % 2 === 0) {
            sumEven += digit;
          } else {
            const doubled = digit * 2;
            sumOdd += doubled > 9 ? doubled - 9 : doubled;
          }
        }
        const total = sumOdd + sumEven;
        const controlDigit = (10 - (total % 10)) % 10;
        const controlLetter = letters[controlDigit];
        const lastChar = clean[8];
        const valid = lastChar === controlDigit.toString() || lastChar === controlLetter;
        return { content: [{ type: "text", text: JSON.stringify({ valid, type: "CIF", id: clean }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ valid: false, reason: "Format not recognized. Expected NIF (8 digits + letter), NIE (X/Y/Z + 7 digits + letter) or CIF (letter + 7 digits + control)" }) }] };
    }
  );

  // ── FERRAMENTA 7: Calcular Dias Úteis ──
  server.registerTool(
    "calculate_working_days",
    {
      description: "Counts the number of working days between two dates (inclusive), excluding Saturdays, Sundays, and all 10 Portuguese national public holidays. Returns { start_date, end_date, working_days: number }. Use when calculating Portuguese invoice payment deadlines (30/60/90 days), legal notice periods, project milestones, SLA response times, or any business process governed by Portuguese working days. Input dates must be in YYYY-MM-DD format.",
      inputSchema: {
        start_date: z.string().describe("Start date in YYYY-MM-DD format, inclusive. Example: '2026-01-01'"),
        end_date: z.string().describe("End date in YYYY-MM-DD format, inclusive. Example: '2026-01-31'")
      },
      annotations: { title: "Calculate Portuguese Working Days", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ start_date, end_date }) => {
      const holidays = [
        "01-01", "04-25", "05-01", "06-10",
        "08-15", "10-05", "11-01", "12-01", "12-08", "12-25"
      ];
      const start = new Date(start_date);
      const end = new Date(end_date);
      if (isNaN(start) || isNaN(end)) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Invalid date format. Use YYYY-MM-DD" }) }] };
      }
      let count = 0;
      const current = new Date(start);
      while (current <= end) {
        const dayOfWeek = current.getDay();
        const mmdd = `${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(mmdd)) {
          count++;
        }
        current.setDate(current.getDate() + 1);
      }
      return { content: [{ type: "text", text: JSON.stringify({ start_date, end_date, working_days: count }) }] };
    }
  );

  // ── FERRAMENTA 8: Feriados Espanhóis ──
  server.registerTool(
    "get_spain_holidays",
    {
      description: "Returns all Spanish national public holidays for a given year as a structured list. Each holiday includes { date: 'YYYY-MM-DD', name: string, name_en: string }. Returns 9 mandatory national holidays defined by Spanish law. Use when calculating business deadlines, delivery dates, or scheduling tasks that must avoid non-working days in Spain. Does not include regional holidays that vary by autonomous community (Catalonia, Madrid, Andalusia, etc.) — only nationally mandated holidays are returned.",
      inputSchema: { year: z.number().describe("Calendar year as a 4-digit integer. Example: 2026") },
      annotations: { title: "Get Spain Public Holidays", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ year }) => {
      const holidays = [
        { date: `${year}-01-01`, name: "Año Nuevo", name_en: "New Year's Day" },
        { date: `${year}-01-06`, name: "Epifanía del Señor", name_en: "Epiphany" },
        { date: `${year}-05-01`, name: "Fiesta del Trabajo", name_en: "Labour Day" },
        { date: `${year}-08-15`, name: "Asunción de la Virgen", name_en: "Assumption of Mary" },
        { date: `${year}-10-12`, name: "Fiesta Nacional de España", name_en: "Spanish National Day" },
        { date: `${year}-11-01`, name: "Todos los Santos", name_en: "All Saints Day" },
        { date: `${year}-12-06`, name: "Día de la Constitución Española", name_en: "Constitution Day" },
        { date: `${year}-12-08`, name: "Inmaculada Concepción", name_en: "Immaculate Conception" },
        { date: `${year}-12-25`, name: "Navidad", name_en: "Christmas Day" },
      ];
      return { content: [{ type: "text", text: JSON.stringify({ year, country: "Spain", total_holidays: holidays.length, holidays }) }] };
    }
  );

  // ── FERRAMENTA 9: Validar SIRET Francês ──
  server.registerTool(
    "validate_siret",
    {
      description: "Validates a French SIRET (Système d'Identification du Répertoire des Établissements) number using the official Luhn algorithm. SIRET is a 14-digit number — the first 9 digits are the SIREN (company identifier) and the last 5 digits identify the specific establishment. Returns { valid: boolean, siren: string, establishment: string, siret: string }. Use when processing French invoices (factures), validating supplier registrations, or any B2B transaction requiring a verified French business establishment identifier. Handles the La Poste special case automatically.",
      inputSchema: { siret: z.string().describe("14-digit French SIRET, with or without spaces/dashes. Example: '732 829 320 00074' or '73282932000074'") },
      annotations: { title: "Validate French SIRET", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ siret }) => {
      const clean = siret.replace(/[\s\-]/g, "");
      if (!/^\d{14}$/.test(clean)) {
        return { content: [{ type: "text", text: JSON.stringify({ valid: false, reason: "SIRET must have exactly 14 digits" }) }] };
      }
      if (clean.startsWith("356000000")) {
        const sum = clean.split("").reduce((acc, d) => acc + parseInt(d), 0);
        const valid = sum % 5 === 0;
        return { content: [{ type: "text", text: JSON.stringify({ valid, siren: clean.substring(0, 9), establishment: clean.substring(9), siret: clean }) }] };
      }
      let sum = 0;
      for (let i = 0; i < 14; i++) {
        let digit = parseInt(clean[i]);
        if (i % 2 === 0) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
      }
      const valid = sum % 10 === 0;
      const siren = clean.substring(0, 9);
      const establishment = clean.substring(9);
      return { content: [{ type: "text", text: JSON.stringify({ valid, siren, establishment, siret: clean }) }] };
    }
  );

  // ── FERRAMENTA 10: Validar Número TVA Francês ──
  server.registerTool(
    "validate_tva_fr",
    {
      description: "Validates a French TVA intracom (VAT) number — the EU VAT identifier for French companies. Format is 'FR' + 2 alphanumeric key characters + 9-digit SIREN. Returns { valid: boolean, key: string, siren: string, tva: string }. When the key is numeric, validates using the official formula: key = (12 + 3 × (SIREN mod 97)) mod 97. Use when validating French supplier VAT numbers, processing cross-border EU invoices, or any intra-EU transaction requiring a verified French VAT identifier.",
      inputSchema: { tva: z.string().describe("French TVA intracom number with or without spaces. Example: 'FR 40 303 265 045' or 'FR40303265045'") },
      annotations: { title: "Validate French TVA (VAT) Number", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ tva }) => {
      const clean = tva.replace(/\s/g, "").toUpperCase();
      if (!/^FR[A-Z0-9]{2}\d{9}$/.test(clean)) {
        return { content: [{ type: "text", text: JSON.stringify({ valid: false, reason: "French TVA must start with FR followed by 2 alphanumeric characters and 9 digits. Example: FR40303265045" }) }] };
      }
      const key = clean.substring(2, 4);
      const siren = clean.substring(4);
      if (/^\d{2}$/.test(key)) {
        const expectedKey = (12 + 3 * (parseInt(siren) % 97)) % 97;
        const valid = parseInt(key) === expectedKey;
        return { content: [{ type: "text", text: JSON.stringify({ valid, key, siren, tva: clean }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ valid: true, key, siren, tva: clean, note: "Alphanumeric key — format valid, checksum not applicable" }) }] };
    }
  );

  // ── FERRAMENTA 11: Feriados Franceses ──
  server.registerTool(
    "get_france_holidays",
    {
      description: "Returns all French national public holidays for a given year as a structured list. Each holiday includes { date: 'YYYY-MM-DD', name: string, name_en: string }. Returns 11 mandatory holidays defined by French law. Easter-dependent holidays (Easter Monday, Ascension Thursday, Whit Monday) are dynamically calculated for the requested year using the Anonymous Gregorian algorithm. Use when calculating French business deadlines, delivery dates, or scheduling tasks that must avoid non-working days in France.",
      inputSchema: { year: z.number().describe("Calendar year as a 4-digit integer. Example: 2026") },
      annotations: { title: "Get France Public Holidays", readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ year }) => {
      const a = year % 19;
      const b = Math.floor(year / 100);
      const c = year % 100;
      const d = Math.floor(b / 4);
      const e = b % 4;
      const f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4);
      const k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      const easter = new Date(year, month - 1, day);

      const addDays = (date, days) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
      };
      const fmt = (d) => d.toISOString().split("T")[0];

      const easterMonday = addDays(easter, 1);
      const ascension = addDays(easter, 39);
      const whitMonday = addDays(easter, 50);

      const holidays = [
        { date: `${year}-01-01`, name: "Jour de l'An", name_en: "New Year's Day" },
        { date: fmt(easterMonday), name: "Lundi de Pâques", name_en: "Easter Monday" },
        { date: `${year}-05-01`, name: "Fête du Travail", name_en: "Labour Day" },
        { date: `${year}-05-08`, name: "Victoire 1945", name_en: "Victory in Europe Day" },
        { date: fmt(ascension), name: "Ascension", name_en: "Ascension Day" },
        { date: fmt(whitMonday), name: "Lundi de Pentecôte", name_en: "Whit Monday" },
        { date: `${year}-07-14`, name: "Fête Nationale", name_en: "Bastille Day" },
        { date: `${year}-08-15`, name: "Assomption", name_en: "Assumption of Mary" },
        { date: `${year}-11-01`, name: "Toussaint", name_en: "All Saints Day" },
        { date: `${year}-11-11`, name: "Armistice", name_en: "Armistice Day" },
        { date: `${year}-12-25`, name: "Noël", name_en: "Christmas Day" },
      ];

      return { content: [{ type: "text", text: JSON.stringify({ year, country: "France", total_holidays: holidays.length, holidays }) }] };
    }
  );

  return server;
};

// ── Servidor HTTP ──
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      name: "mcp-europe-tools",
      version: "1.2.2",
      description: "European data tools for AI agents",
      tools: ["validate_nif", "validate_iban", "get_vat_rate", "get_portugal_holidays", "format_number_european", "validate_nif_es", "calculate_working_days", "get_spain_holidays", "validate_siret", "validate_tva_fr", "get_france_holidays"],
      mcp_endpoint: "/mcp"
    }));
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
  console.log(`MCP Europe Tools server running on port ${PORT}`);
});
