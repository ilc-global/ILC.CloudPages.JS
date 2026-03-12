# Column Formatting Guide

The `<script id="columns">` block controls how query result columns are displayed in the DataTable. Columns not listed in this config still appear — they use default formatting and auto-generated headers.

## Column Properties

```json
{
    "column_alias": {
        "label": "Display Name",
        "format": "currency",
        "visible": true,
        "width": "120px"
    }
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `label` | string | Auto from key | Column header text. Default converts `snake_case` to `Title Case` |
| `format` | string | none | Formatting function: `currency`, `date`, `number`, `percent` |
| `visible` | boolean | `true` | Set to `false` to hide the column (data is still available for export/hooks) |
| `width` | string | auto | CSS width for the column |

## Format Types

### `currency`

Formats numbers as US dollars using `Intl.NumberFormat`.

```json
{ "total_price": { "format": "currency" } }
```

| Raw Value | Displayed |
|-----------|-----------|
| `15.5` | `$15.50` |
| `1234.567` | `$1,234.57` |
| `0` | `$0.00` |

Decimal places are controlled by the `amount_unit_format` setting. Default is 2 decimals.

```json
// In settings:
{ "amount_unit_format": "$0.0000" }  // → 4 decimal places
```

### `date`

Formats date strings using the browser's locale via `Date.toLocaleDateString()`.

```json
{ "date_issued": { "format": "date" } }
```

| Raw Value | Displayed (en-US) |
|-----------|-----------|
| `2024-06-15` | `6/15/2024` |
| `2024-06-15T14:30:00` | `6/15/2024` |

If the value cannot be parsed as a date, it is displayed as-is.

### `number`

Formats numbers with locale-aware thousands separators and configurable decimal places.

```json
{ "qty_fulfilled": { "format": "number" } }
```

| Raw Value | Displayed |
|-----------|-----------|
| `10.5` | `10.50` |
| `1234` | `1,234.00` |

Decimal places are controlled by the `qty_unit_format` setting. Default is 2 decimals.

```json
// In settings:
{ "qty_unit_format": "0.0000" }  // → 4 decimal places
```

### `percent`

Multiplies by 100 and appends `%`. Assumes the raw value is a decimal (e.g., `0.15` = 15%).

```json
{ "margin": { "format": "percent" } }
```

| Raw Value | Displayed |
|-----------|-----------|
| `0.234` | `23.40%` |
| `0.5` | `50.00%` |
| `1.0` | `100.00%` |

## Column Header Labels

By default, column headers are generated from the SQL alias by converting `snake_case` to `Title Case`:

| SQL Alias | Default Header |
|-----------|---------------|
| `so_num` | `So Num` |
| `date_issued` | `Date Issued` |
| `qty_to_fulfill` | `Qty To Fulfill` |
| `customer_name` | `Customer Name` |

Override with the `label` property:

```json
{
    "so_num": { "label": "SO #" },
    "qty_to_fulfill": { "label": "Qty Open" }
}
```

## Hidden Columns

Hide columns from the table while keeping the data available for hooks and export:

```json
{
    "internal_id": { "visible": false },
    "sort_key": { "visible": false }
}
```

Hidden columns are:
- Not displayed in the DataTable
- Still present in the data passed to `onRenderRow` and `onExport` hooks
- Included in XLSX/CSV exports (unless filtered by `onExport`)

## Column Width

Set explicit widths to prevent columns from auto-sizing:

```json
{
    "description": { "width": "300px" },
    "so_num": { "width": "100px" }
}
```

## Auto-Detected Columns

Columns returned by your SQL query that are **not** listed in the columns config still appear in the table. They use:
- Header: `snake_case` → `Title Case`
- Format: none (raw value displayed as-is)
- Visible: `true`
- Width: auto

This means you only need to configure columns that need special formatting, labels, or visibility control.

## Full Example

```html
<script id="columns" type="application/json">
{
    "so_num": {
        "label": "SO #",
        "width": "100px"
    },
    "customer_name": {
        "label": "Customer"
    },
    "total_price": {
        "label": "Total",
        "format": "currency"
    },
    "total_tax": {
        "label": "Tax",
        "format": "currency"
    },
    "date_issued": {
        "format": "date"
    },
    "qty_fulfilled": {
        "label": "Qty Shipped",
        "format": "number"
    },
    "margin": {
        "format": "percent"
    },
    "internal_id": {
        "visible": false
    }
}
</script>
```
