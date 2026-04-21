# MCP Europe Tools

[![smithery badge](https://smithery.ai/badge/josemvelez/mcp-europe-tools)](https://smithery.ai/servers/josemvelez/mcp-europe-tools)

European data validation and formatting tools for AI agents.

## Overview

MCP Europe Tools provides essential European data validation and formatting capabilities for AI agents working with Portuguese and European business data.

**Live endpoint:** `https://mcp-europe-tools-production.up.railway.app/mcp`

## Tools

### validate_nif
Validates Portuguese NIF (tax identification numbers) using the official checksum algorithm.

**Input:**
- `nif` (string) — The Portuguese NIF to validate

**Example:**
```json
{ "nif": "123456789" }
```

**Output:**
```json
{ "valid": true, "nif": "123456789" }
```

---

### validate_iban
Validates IBAN numbers for 18 European countries.

**Input:**
- `iban` (string) — The IBAN to validate

**Example:**
```json
{ "iban": "PT50000201231234567890154" }
```

**Output:**
```json
{ "valid": true, "country": "PT", "iban": "PT50000201231234567890154" }
```

---

### get_vat_rate
Returns VAT rates for any EU country.

**Input:**
- `country_code` (string) — Two-letter country code (PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR)

**Example:**
```json
{ "country_code": "PT" }
```

**Output:**
```json
{ "standard": 23, "intermediate": 13, "reduced": 6, "country": "Portugal" }
```

---

### get_portugal_holidays
Returns Portuguese public holidays for any given year.

**Input:**
- `year` (number) — The year

**Example:**
```json
{ "year": 2026 }
```

**Output:**
```json
{
  "year": 2026,
  "country": "Portugal",
  "holidays": [
    { "date": "2026-01-01", "name": "Ano Novo", "name_en": "New Year's Day" }
  ]
}
```

---

### format_number_european
Formats numbers according to European locale conventions.

**Input:**
- `number` (number) — The number to format
- `country_code` (string) — Country code (PT, ES, FR, DE, etc)
- `decimals` (number, optional) — Decimal places (default 2)

**Example:**
```json
{ "number": 1234.56, "country_code": "PT" }
```

**Output:**
```json
{ "original": 1234.56, "formatted": "1.234,56", "locale": "pt-PT" }
```

## Usage with Claude

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "mcp-europe-tools": {
      "url": "https://mcp-europe-tools-production.up.railway.app/mcp"
    }
  }
}
```

## Supported Countries

Portugal, Spain, France, Germany, Italy, Netherlands, Belgium, Poland, Sweden, Denmark, Finland, Austria, Ireland, Greece, Hungary, Romania, Czech Republic, Croatia.

## License

MIT
