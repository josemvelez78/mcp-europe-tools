# MCP Europe Tools

[![Smithery badge](https://smithery.ai/badge/josemvelez/mcp-europe-tools)](https://smithery.ai/servers/josemvelez/mcp-europe-tools)
[![Glama badge](https://glama.ai/mcp/servers/josemvelez78/mcp-europe-tools/badges/score.svg)](https://glama.ai/mcp/servers/josemvelez78/mcp-europe-tools)

Essential European data validation and formatting tools for AI agents working with Portuguese, Spanish, French and European business data.

## Quickstart

**Option 1 — MCPize (hosted, no setup):**
```
https://europe-tools.mcpize.run
```
Free tier: 500 requests/month, no credit card required. [Get your API key →](https://mcpize.com)

**Option 2 — Smithery:**
```bash
smithery mcp add josemvelez/mcp-europe-tools
```

**Option 3 — Claude Desktop (direct endpoint):**
```json
{
  "mcpServers": {
    "mcp-europe-tools": {
      "url": "https://mcp-europe-tools-production.up.railway.app/mcp"
    }
  }
}
```

## What it does

11 tools for European compliance workflows — validate tax IDs, verify IBANs, look up VAT rates, get public holidays, and format numbers for any European locale. No auth required. Read-only and idempotent.

**Typical use cases:**
- Validate invoices and tax IDs for EU customers (NIF, NIE, CIF, SIRET, TVA)
- Verify IBANs before processing SEPA transfers or direct debits
- Look up VAT rates for e-commerce checkout by customer country
- Calculate payment deadlines excluding Portuguese public holidays
- Format prices correctly for each European market

## Tools

### 🇵🇹 Portugal
| Tool | Description |
|------|-------------|
| `validate_nif` | Validates Portuguese NIF using the official AT modulo-11 checksum |
| `get_portugal_holidays` | Returns all 10 Portuguese national public holidays for any year |
| `calculate_working_days` | Counts working days between two dates, excluding weekends and Portuguese holidays |

### 🇪🇸 Spain
| Tool | Description |
|------|-------------|
| `validate_nif_es` | Validates Spanish NIF (citizens), NIE (foreign residents) and CIF (companies) |
| `get_spain_holidays` | Returns all 9 Spanish national public holidays for any year |

### 🇫🇷 France
| Tool | Description |
|------|-------------|
| `validate_siret` | Validates French SIRET (14-digit company establishment number) using Luhn |
| `validate_tva_fr` | Validates French TVA intracom VAT number |
| `get_france_holidays` | Returns all 11 French national public holidays, including Easter-dependent dates |

### 🇪🇺 Europe (18 countries)
| Tool | Description |
|------|-------------|
| `validate_iban` | Validates IBAN using ISO 13616 MOD-97 — supports PT, ES, FR, DE, IT, NL, BE, PL, SE, DK, FI, AT, IE, GR, HU, RO, CZ, HR |
| `get_vat_rate` | Returns standard, reduced, intermediate and super-reduced VAT rates for 18 EU countries |
| `format_number_european` | Formats numbers using the correct decimal/thousands separators for any European locale |

## Supported Countries

Portugal, Spain, France, Germany, Italy, Netherlands, Belgium, Poland, Sweden, Denmark, Finland, Austria, Ireland, Greece, Hungary, Romania, Czech Republic, Croatia.

## Pricing

| Plan | Requests | Price |
|------|----------|-------|
| Free | 500/month | $0 — no credit card |
| Pro | 5,000/month | $9/month or $86/year |
| Overage | Beyond plan | $0.001/request |

Available via [MCPize](https://mcpize.com).

## License

MIT
