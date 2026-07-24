# Getting Started with CloudPages

This guide walks you through building your first CloudPage report — from an empty HTML file to a working, interactive report with parameters, a data table, and Excel export.

## Prerequisites

- **Fishbowl Advanced** with CloudPages enabled
- **fb.js** — the ILC cross-platform client library ([ILC.Fishbowl.JS](https://github.com/ilc-global/ILC.Fishbowl.JS))
- Basic familiarity with SQL and HTML

## Your First CloudPage

### Step 1: Create the HTML file

Create a new `.html` file. This file goes in your CloudPages plugin directory — the root of your repository.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Fishbowl metadata -->
    <meta name="fb_path" content="Reports/Sales">
    <meta name="fb_modules" content="Sales Order">
    <meta name="fb_title" content="Sales Report">
    <meta name="fb_description" content="Sales orders by customer and date range">
    <meta name="window_state" content="maximized">

    <title>Sales Report</title>

    <!-- Bootstrap 5 -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css">

    <!-- Dependencies -->
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap5.min.js"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>

    <!-- ILC Libraries -->
    <script src="js/fb.js"></script>
    <script src="js/cloudpages.js"></script>
    <link rel="stylesheet" href="css/cloudpages.css">
</head>
<body>
    <div class="container mt-3">
        <div id="parametersContainer" class="mb-3"></div>
        <div class="mb-3">
            <button id="submitButton" class="btn btn-primary">Run</button>
            <button id="exportBtn" class="btn btn-secondary">Export</button>
        </div>
        <div id="tableContainer"></div>
    </div>

    <!-- Configuration goes here (see steps below) -->

</body>
</html>
```

### Step 2: Define Settings

Add a `<script id="settings">` block before `</body>`:

```html
<script id="settings" type="application/json">
{
    "load_on_open": false,
    "page_length": 25,
    "enable_xlsx_export": true,
    "enable_csv_export": true,
    "amount_unit_format": "$0.00",
    "qty_unit_format": "0.00"
}
</script>
```

- `load_on_open: true` — runs the query immediately when the page loads (useful for dashboards)
- `page_length` — rows per page when paginating (default 100)
- `paginate_over` — results below this count render in full with no pager;
  at or above it the table paginates (default 100)
- `enable_xlsx_export` / `enable_csv_export` / `enable_markdown_export` —
  which export formats to offer (all default on)
- `dense` — start in compact (smaller text) mode; users can toggle it with
  the **Compact** button in the table toolbar either way
- `theme` — `"auto"` (default, follows the OS), `"light"`, or `"dark"`
- `title` — report title used for export filenames and metadata
- `collapsible_parameters` (default `true`) — the engine renders the parameter
  form inside a collapsible "Parameters" panel (caret heading) that
  auto-collapses after a successful run; `parameters_label` retitles it

### Step 3: Define Parameters

Parameters are the input form your users fill out before running the report:

```html
<script id="parameters" type="application/json">
{
    "customer": {
        "label": "Customer",
        "type": "dropdown",
        "mode": "single",
        "required": true,
        "sql": "SELECT id, name FROM customer WHERE activeFlag = 1 ORDER BY name",
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
```

This creates:
- A dropdown populated from the `customer` table
- A date range picker with start and end fields

### Step 4: Write the SQL Query

```html
<script id="query" type="text/plain">
SELECT
    so.num AS so_num,
    customer.name AS customer_name,
    so.totalPrice AS total_price,
    so.totalTax AS total_tax,
    so.dateIssued AS date_issued
FROM so
    JOIN customer ON customer.id = so.customerId
WHERE so.customerId = :customer
AND DATE(so.dateIssued) BETWEEN :date_issued_start AND :date_issued_end
ORDER BY so.dateIssued DESC
LIMIT 500
</script>
```

Key points:
- Use `:paramName` placeholders — they map directly to parameter keys
- Range parameters automatically create `:param_start` and `:param_end` placeholders
- **Always use parameterized queries** — values are bound via `FB.query()`, never concatenated
- Use column aliases (`AS so_num`) — these become the keys in your result rows and column config

### Step 5: Configure Columns

```html
<script id="columns" type="application/json">
{
    "so_num": {
        "label": "SO #"
    },
    "total_price": {
        "format": "currency"
    },
    "total_tax": {
        "format": "currency"
    },
    "date_issued": {
        "format": "date"
    }
}
</script>
```

- Columns you don't list still appear — they just use default formatting
- `label` overrides the column header (default is `snake_case` converted to `Title Case`)
- `format` applies automatic formatting: `currency`, `date`, `number`, `percent`

### Step 6: Deploy and Run

1. Copy the HTML file and `js/`/`css/` folders to your CloudPages plugin directory in Fishbowl
2. Open the page in Fishbowl
3. Select a customer, pick a date range, and click **Run**
4. Click **Export** to download the results as an Excel file

## What Happens Behind the Scenes

When you click **Run**, cloudpages.js executes this lifecycle:

```
1. validateParameters()    → checks required fields
2. collectValues()         → reads form inputs into a flat object
3. onBeforeQuery hook      → optional: modify SQL/params
4. bindParams()            → replaces :placeholders, expands arrays
5. FB.queryAsync()         → sends parameterized SQL to Fishbowl
6. onAfterQuery hook       → optional: transform result rows
7. onRenderRow hook        → optional: per-row modifications
8. renderTable()           → DataTables with formatting
```

No JavaScript code required on your part — just HTML and JSON configuration.

## Required DOM Elements

| Element | Purpose |
|---------|---------|
| `<div id="parametersContainer">` | Parameter form renders here |
| `<button id="submitButton">` | Triggers query execution |
| `<button id="exportBtn">` | Placeholder the engine replaces with the export button group: **Export XLSX** and **Export CSV** split buttons (the carat opens per-format options: file name, include parameters) plus a **Markdown** button. XLSX exports include a `Parameters` sheet recording how the file was generated (disable per-export via the carat). |
| `<div id="tableContainer">` | DataTable renders here |

## Required Script Blocks

| Block | Type | Purpose |
|-------|------|---------|
| `<script id="settings">` | `application/json` | Page behavior settings |
| `<script id="parameters">` | `application/json` | Parameter form definitions |
| `<script id="query">` | `text/plain` | SQL query template |
| `<script id="columns">` | `application/json` | Column formatting and labels |

All four blocks are required. If any is missing or has invalid JSON, cloudpages.js logs a descriptive error to the console.

## Fishbowl Metadata Tags

These `<meta>` tags in `<head>` control how Fishbowl displays and categorizes your page:

| Tag | Purpose | Example |
|-----|---------|---------|
| `fb_path` | Menu path in CloudPages browser | `Reports/Sales` |
| `fb_modules` | Fishbowl module filter | `Sales Order` |
| `fb_title` | Display name | `Sales Report` |
| `fb_description` | Description shown in page list | `Sales orders by customer...` |
| `window_state` | Window size | `maximized`, `normal` |

## Next Steps

- **[Parameter Types Reference](parameter-types.md)** — all 9 parameter types with examples
- **[Column Formatting Guide](column-formatting.md)** — formatting options and custom labels
- **[Hooks & Customization](hooks-and-customization.md)** — extend behavior with hooks and custom renderers
- **[SQL Patterns](sql-patterns.md)** — common Fishbowl SQL patterns for CloudPages
- **[Examples](examples.md)** — complete example pages for common reports
