import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "http";
 
const createServer = () => {
  const server = new McpServer({
    name: "mcp-europe-tools",
    version: "1.1.0",
    description: "Essential European data validation and formatting tools for AI agents working with Portuguese, Spanish and European business data. Covers NIF/NIE/CIF validation, IBAN verification, VAT rates, public holidays and number formatting for 18+ European countries."
  });
 
  // ── FERRAMENTA 1: Validar NIF Português ──
  server.tool(
    "validate_nif",
    "Validates a Portuguese NIF (Número de Identificação Fiscal) using the official Portuguese Tax Authority checksum algorithm. Use this tool when processing Portuguese invoices, tax forms, user registrations, or any document requiring a valid Portuguese fiscal number. Input must be a 9-digit string. Returns whether the NIF is mathematically valid, along with the cleaned NIF. Does not verify if the NIF exists in the Tax Authority database — only validates the format and checksum.",
    { nif: z.string().describe("The Portuguese NIF to validate. Can include spaces which will be stripped. Example: '123456789'") },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "validate_iban",
    "Validates an IBAN (International Bank Account Number) for any European country using the official MOD-97 algorithm. Use this tool when processing bank transfers, payment forms, supplier registrations, or any financial document requiring a valid European bank account number. Supports all European countries including Portugal (PT), Spain (ES), France (FR), Germany (DE), Italy (IT), Netherlands (NL) and 12 more. Returns whether the IBAN is valid, the country code extracted from the IBAN, and the cleaned IBAN without spaces.",
    { iban: z.string().describe("The IBAN to validate. Spaces are automatically removed. Example: 'PT50 0002 0123 1234 5678 9015 4'") },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "get_vat_rate",
    "Returns the current VAT (Value Added Tax) rates for any European Union country, including standard, reduced, intermediate and super-reduced rates where applicable. Use this tool when calculating prices, generating invoices, processing e-commerce transactions, or any task requiring accurate EU tax rates. Supports 18 EU countries: PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR. Returns all applicable rates and the country name.",
    { country_code: z.string().describe("Two-letter ISO country code. Example: 'PT' for Portugal, 'ES' for Spain, 'DE' for Germany") },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "get_portugal_holidays",
    "Returns the complete list of Portuguese national public holidays for any given year. Use this tool when calculating delivery dates, scheduling appointments, computing working days, or any task that requires knowing which days are non-working in Portugal. Returns all 10 mandatory national holidays with dates in YYYY-MM-DD format and names in both Portuguese and English. Note: does not include municipal holidays which vary by city.",
    { year: z.number().describe("The year to get holidays for. Example: 2026") },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "format_number_european",
    "Formats a number according to the locale conventions of a specific European country. Use this tool when displaying prices, quantities, measurements or any numeric value to end users in a specific European country. European countries use different decimal separators and thousand separators — for example Portugal uses '1.234,56' while the UK uses '1,234.56'. Supports PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO. Returns the formatted string, the locale used, and the original number.",
    {
      number: z.number().describe("The number to format. Example: 1234.56"),
      country_code: z.string().describe("Two-letter country code for the target locale. Example: 'PT' for Portugal"),
      decimals: z.number().optional().describe("Number of decimal places to show. Defaults to 2. Example: 0 for whole numbers, 2 for prices")
    },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "validate_nif_es",
    "Validates Spanish tax identification numbers including NIF (DNI for Spanish citizens, 8 digits + letter), NIE (Número de Identidad de Extranjero for foreigners, starts with X/Y/Z) and CIF (Código de Identificación Fiscal for companies, starts with a letter). Use this tool when processing Spanish invoices, tax forms, user registrations, e-commerce orders, or any document requiring a valid Spanish fiscal identifier. Returns the document type detected (NIF, NIE or CIF), whether it is valid, and the cleaned identifier.",
    { id: z.string().describe("The Spanish NIF, NIE or CIF to validate. Spaces are automatically removed. Examples: '12345678Z' for NIF, 'X1234567L' for NIE, 'B12345678' for CIF") },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "calculate_working_days",
    "Calculates the number of working days between two dates, excluding weekends (Saturday and Sunday) and all Portuguese national public holidays. Use this tool when calculating invoice payment deadlines, project delivery dates, legal notice periods, SLA calculations, or any business process that operates on Portuguese working days. Input dates must be in YYYY-MM-DD format. Returns the count of working days and the start/end dates used.",
    {
      start_date: z.string().describe("Start date in YYYY-MM-DD format. Example: '2026-01-01'"),
      end_date: z.string().describe("End date in YYYY-MM-DD format. Example: '2026-01-31'")
    },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
  server.tool(
    "get_spain_holidays",
    "Returns the complete list of Spanish national public holidays for any given year. Use this tool when calculating delivery dates, scheduling appointments, computing working days, or any task that requires knowing which days are non-working in Spain. Returns all national holidays with dates in YYYY-MM-DD format and names in both Spanish and English. Note: Spain also has regional holidays that vary by autonomous community (Catalonia, Madrid, etc.) which are not included here.",
    { year: z.number().describe("The year to get holidays for. Example: 2026") },
    { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
 
  return server;
};
 
// ── Servidor HTTP ──
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      name: "mcp-europe-tools",
      version: "1.1.0",
      description: "European data tools for AI agents",
      tools: ["validate_nif", "validate_iban", "get_vat_rate", "get_portugal_holidays", "format_number_european", "validate_nif_es", "calculate_working_days", "get_spain_holidays"],
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
