# MCP Europe Tools

[![smithery badge](https://smithery.ai/badge/josemvelez/mcp-europe-tools)](https://smithery.ai/servers/josemvelez/mcp-europe-tools)

Essential European data validation and formatting tools for AI agents working with Portuguese, Spanish and European business data.

## Overview

MCP Europe Tools provides data validation and formatting capabilities for AI agents handling European invoices, tax forms, payments, and compliance workflows.

**Live endpoint:** `https://mcp-europe-tools-production.up.railway.app/mcp`

## Tools

### 🇵🇹 Portugal
- **validate_nif** — Validates Portuguese NIF using the official AT checksum algorithm
- **get_portugal_holidays** — Returns Portuguese national public holidays for any year
- **calculate_working_days** — Calculates working days between two dates excluding Portuguese holidays

### 🇪🇸 Spain
- **validate_nif_es** — Validates Spanish NIF, NIE and CIF identifiers
- **get_spain_holidays** — Returns Spanish national public holidays for any year

### 🇪🇺 Europe
- **validate_iban** — Validates IBAN for 18 European countries using MOD-97
- **get_vat_rate** — Returns VAT rates for 18 EU countries
- **format_number_european** — Formats numbers according to European locale conventions

## Usage

Connect via Smithery:

```
smithery mcp add josemvelez/mcp-europe-tools
```

Or add to your Claude Desktop configuration:

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
