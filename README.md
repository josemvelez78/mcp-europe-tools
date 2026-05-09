# MCP Europe Business Suite

European business compliance suite for AI agents — **28 tools** covering tax ID validation, IBAN, VAT rates, e-invoicing rules, payment terms, and labor calendar helpers across **18+ European countries**.

Part of [MCPize](https://mcpize.com) — regional MCP servers for AI agents.

## Coverage

| Module | Country coverage |
|--------|-----------------|
| **Tax IDs** | PT (NIF), ES (NIF/NIE/CIF), FR (SIRET, TVA), IT (Codice Fiscale, Partita IVA), DE (USt-IdNr), UK (VAT), NL (KVK) |
| **IBAN** | 18 EU countries (PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR) |
| **VAT rates** | 19 countries (18 EU + UK) |
| **Payment terms** | 10 countries (PT, ES, FR, DE, IT, NL, BE, UK, SE, PL) |
| **E-invoicing** | 10 countries with timelines and formats |
| **Holidays** | 8 countries with Easter-based moveable holidays |
| **Postal codes** | 16 countries |

## Tools (28 total)

**Validation (17):** `validate_nif`, `validate_iban`, `get_vat_rate`, `get_portugal_holidays`, `get_spain_holidays`, `get_france_holidays`, `validate_nif_es`, `validate_siret`, `validate_tva_fr`, `calculate_working_days`, `format_number_european`, `validate_codice_fiscale`, `validate_partita_iva`, `validate_vat_de`, `validate_vat_uk`, `validate_kvk_nl`, `validate_postal_code`

**Business Rules (4):** `get_payment_terms`, `get_invoice_requirements`, `get_vat_exemption_threshold`, `get_einvoicing_rules`

**Labor Helpers (3):** `get_public_holidays_range`, `calculate_working_days_eu`, `get_next_payment_date`

**Invoice & VAT (4):** `validate_invoice_schema`, `calculate_vat_breakdown`, `suggest_vat_treatment`, `calculate_vat_amount`

## What's new in v1.2.0

- Timezone-safe date formatting (no more UTC offset bugs)
- Easter-based moveable holidays added to Portugal (Sexta-feira Santa) and Spain (Viernes Santo)
- `nth_working_day` rule now correctly handles months without enough working days
- Consistent `outputSchema` (Zod) on every tool — Smithery Typed Output ready
- Refactored shared helpers (no duplicated Easter calculations across tools)
- New `/health` endpoint for Railway/Docker healthchecks

## Local development

```bash
npm install
npm start           # stdio transport (for Glama / Claude Desktop)
npm run start:http  # HTTP transport on port 8080 (for Railway / hosted use)
```

## Endpoints (HTTP mode)

- `GET /` — server metadata and tool list
- `GET /health` — health check (returns `{"status":"ok"}`)
- `POST /mcp` — MCP Streamable HTTP endpoint

## Disclaimer

All compliance, tax, and legal information returned by these tools is **reference only — not legal or tax advice**. VAT rates, e-invoicing rules, and holiday calendars change frequently. Always verify with the relevant tax authority and a qualified professional before use in production.

## License

MIT
