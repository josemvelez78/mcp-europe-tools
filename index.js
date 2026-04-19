import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "http";

const createServer = () => {
  const server = new McpServer({
    name: "mcp-europe-tools",
    version: "1.0.0",
    description: "European data tools - NIF validation, IBAN validation, VAT rates, public holidays"
  });

  // ── FERRAMENTA 1: Validar NIF Português ──
  server.tool(
    "validate_nif",
    "Validates a Portuguese NIF (tax identification number)",
    { nif: z.string().describe("The Portuguese NIF to validate") },
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
    "Validates an IBAN number from any European country",
    { iban: z.string().describe("The IBAN to validate") },
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
    "Returns the VAT rates for a European country",
    { country_code: z.string().describe("Two-letter country code (e.g. PT, ES, FR, DE)") },
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
    "Returns Portuguese public holidays for a given year",
    { year: z.number().describe("The year to get holidays for (e.g. 2025)") },
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
      return { content: [{ type: "text", text: JSON.stringify({ year, country: "Portugal", holidays }) }] };
    }
  );

  // ── FERRAMENTA 5: Formatar Número Europeu ──
  server.tool(
    "format_number_european",
    "Formats a number according to European locale conventions",
    {
      number: z.number().describe("The number to format"),
      country_code: z.string().describe("Country code for formatting (PT, ES, DE, FR, etc)"),
      decimals: z.number().optional().describe("Number of decimal places (default 2)")
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

  return server;
};

// ── Servidor HTTP ──
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      name: "mcp-europe-tools",
      version: "1.0.0",
      description: "European data tools for AI agents",
      tools: ["validate_nif", "validate_iban", "get_vat_rate", "get_portugal_holidays", "format_number_european"],
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

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`MCP Europe Tools server running on port ${PORT}`);
});
