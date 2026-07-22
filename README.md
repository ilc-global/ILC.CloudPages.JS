# ILC.CloudPages.JS

Declarative report engine for ILC CloudPages. Define parameters, SQL, columns, and settings in HTML `<script>` tags — cloudpages.js handles the full lifecycle: parameter forms, parameterized queries, DataTables rendering, and export.

Depends on [fb.js](https://github.com/ilc-global/ILC.Fishbowl.JS) for database access.

## Quick Start

```html
<script src="fb.js"></script>
<script src="cloudpages.js"></script>
<link rel="stylesheet" href="cloudpages.css">

<script id="settings" type="application/json">
{ "load_on_open": false, "page_length": 25, "enable_xlsx_export": true }
</script>

<script id="parameters" type="application/json">
{
    "customer": {
        "label": "Customer",
        "type": "dropdown",
        "mode": "single",
        "sql": "SELECT id, name FROM customer WHERE activeFlag = 1",
        "value": "id",
        "display": "name"
    },
    "date_issued": {
        "label": "Date Issued",
        "type": "date",
        "mode": "range"
    }
}
</script>

<script id="query" type="text/plain">
SELECT so.num AS so_num, so.totalPrice AS total, so.dateIssued AS date_issued
FROM so
WHERE so.customerId = :customer
AND DATE(so.dateIssued) BETWEEN :date_issued_start AND :date_issued_end
</script>

<script id="columns" type="application/json">
{ "total": { "format": "currency" }, "date_issued": { "format": "date" } }
</script>

<div id="parametersContainer"></div>
<button id="submitButton">Run</button>
<button id="exportBtn">Export</button>
<div id="tableContainer"></div>
```

That's it. No JavaScript to write — cloudpages.js reads the config and wires everything up.

## How It Works

1. On page load, cloudpages.js reads four `<script>` blocks: **settings**, **parameters**, **query**, **columns**
2. Parameter forms render automatically into `#parametersContainer` with Bootstrap 5 classes
3. Clicking `#submitButton` validates, collects values, binds them to the SQL query (`:paramName` placeholders), and executes via `FB.queryAsync()`
4. Results render in a DataTable with sorting, search, pagination, and column formatting
5. `#exportBtn` exports to XLSX (via SheetJS) or CSV, using `FB.saveFile()` in JXBrowser or browser download

## Config Reference

### Settings (`#settings`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `load_on_open` | boolean | `false` | Execute query immediately on page load |
| `page_length` | number | `25` | DataTables rows per page |
| `enable_xlsx_export` | boolean | `true` | Show XLSX export option |
| `enable_csv_export` | boolean | `true` | Show CSV export option |
| `amount_unit_format` | string | `"$0.00"` | Currency format pattern |
| `qty_unit_format` | string | `"0.00"` | Number format pattern |
| `demo_data` | string | — | Path to a demo-data JSON file, fetched lazily outside JXBrowser (see [Demo Mode](docs/demo-mode.md)) |
| `collapsible_parameters` | boolean | `true` | Render parameters in a collapsible panel that auto-collapses after a successful run |
| `parameters_label` | string | `"Parameters"` | Heading of the collapsible panel |

### Parameters (`#parameters`)

Object keyed by parameter name. Each parameter has:

| Key | Required | Description |
|-----|----------|-------------|
| `label` | No | Display label (defaults to `snake_case` converted to Title Case) |
| `type` | Yes | `string`, `int`, `decimal`, `date`, `time`, `timestamp`, `checkbox`, `dropdown`, `autocomplete` |
| `mode` | No | `range` (date/time/number), `single`/`multi` (dropdown) |
| `required` | No | Show validation error if empty |
| `default` | No | Default value |
| `sql` | No | SQL to populate dropdown/autocomplete options |
| `value` | No | Column name for option values |
| `display` | No | Comma-separated column names for display text |
| `search` | No | Column name for autocomplete filtering |
| `minChars` | No | Minimum characters before autocomplete triggers (default: 1) |

**Range mode** (`mode: "range"`): Renders `_start` and `_end` inputs. SQL should use `:param_start` and `:param_end` placeholders.

### Query (`#query`)

Raw SQL with `:paramName` placeholders. Values are bound via `FB.query()` parameterized queries — never string-concatenated.

**Array values** (multi-select dropdown): `:statuses` with `[10, 20]` expands to `:statuses_0, :statuses_1`.

### Columns (`#columns`)

Object keyed by column alias from SQL. Each column can have:

| Key | Description |
|-----|-------------|
| `label` | Override column header (default: snake_case to Title Case) |
| `format` | `currency`, `date`, `number`, `percent` |
| `visible` | `false` to hide column |
| `width` | CSS width value |

Columns not listed here still render — they just use defaults.

## Hooks

Override any hook to customize behavior:

```javascript
// Modify SQL/params before execution
CloudPages.hooks.onBeforeQuery = function(sql, params) {
    return { sql: sql + ' AND active = 1', params: params };
};

// Transform rows after query, before rendering
CloudPages.hooks.onAfterQuery = function(rows) {
    return rows.filter(r => r.total > 0);
};

// Per-row transformation (computed columns, formatting)
CloudPages.hooks.onRenderRow = function(row, index) {
    row.margin = ((row.price - row.cost) / row.price * 100).toFixed(1) + '%';
    return row;
};

// Modify data before export
CloudPages.hooks.onExport = function(rows, format) {
    return rows.map(r => { delete r.internal_id; return r; });
};
```

## Custom Parameter Types

Register custom renderers for domain-specific inputs:

```javascript
CloudPages.registerRenderer('color', {
    render: function(key, cfg) {
        var input = document.createElement('input');
        input.type = 'color';
        input.id = key;
        input.className = 'form-control';
        return input;
    },
    getValue: function(key) {
        return document.getElementById(key).value;
    }
});
```

## Dependencies

| Library | Required | Purpose |
|---------|----------|---------|
| [fb.js](https://github.com/ilc-global/ILC.Fishbowl.JS) | Yes | Database queries, file save, status/progress |
| jQuery 3.x | Yes | DataTables dependency |
| DataTables 1.13+ | Yes | Table rendering, sorting, search, pagination |
| SheetJS (XLSX) | For export | XLSX file generation |
| Bootstrap 5 | Recommended | Form styling (`form-control`, `form-select`, `form-label`) |

## Documentation

- **[Getting Started](docs/getting-started.md)** — Build your first CloudPage report step by step
- **[Parameter Types](docs/parameter-types.md)** — All 9 parameter types with config examples
- **[Column Formatting](docs/column-formatting.md)** — Currency, date, number, percent formatting and custom labels
- **[Hooks & Customization](docs/hooks-and-customization.md)** — Lifecycle hooks, custom renderers, public API
- **[SQL Patterns](docs/sql-patterns.md)** — Common Fishbowl queries for sales, purchasing, inventory, shipping
- **[Examples](docs/examples.md)** — Complete, copy-paste report pages
- **[Demo Mode](docs/demo-mode.md)** — Run the full report (filters, dropdowns, export) in a plain browser from bundled demo data

## Project Structure

```
ILC.CloudPages.JS/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── js/
│   ├── cloudpages.js              # Declarative report engine
│   └── fb.js                      # Cross-platform client library (from ILC.Fishbowl.JS)
├── css/
│   └── cloudpages.css             # Parameter layout, autocomplete, range inputs
├── docs/
│   ├── getting-started.md         # Step-by-step first page guide
│   ├── parameter-types.md         # All 9 parameter types reference
│   ├── column-formatting.md       # Column display and formatting
│   ├── hooks-and-customization.md # Hooks, custom renderers, public API
│   ├── sql-patterns.md            # Fishbowl SQL cookbook
│   └── examples.md                # Complete example pages
└── tests/
    ├── cloudpages-cdp-tests.js    # CDP test runner (69 tests, 5 tiers)
    └── pages/
        └── 01_Example.html        # Example report page
```

## Testing

Tests run via Chrome DevTools Protocol against a live JXBrowser instance:

```bash
node tests/cloudpages-cdp-tests.js        # all 69 tests (tiers 1-5)
node tests/cloudpages-cdp-tests.js 1      # config + SQL binding only
node tests/cloudpages-cdp-tests.js 2      # + parameter renderers
node tests/cloudpages-cdp-tests.js 3      # + live SQL-driven params
node tests/cloudpages-cdp-tests.js 4      # + DataTables rendering
node tests/cloudpages-cdp-tests.js 5      # + export, hooks, full lifecycle
```

| Tier | Tests | Requires Fishbowl |
|------|-------|-------------------|
| 1 | 18 | No |
| 2 | 24 | No |
| 3 | 7 | Yes |
| 4 | 8 | Yes |
| 5 | 12 | Yes |
