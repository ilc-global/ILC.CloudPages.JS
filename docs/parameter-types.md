# Parameter Types Reference

CloudPages supports 9 built-in parameter types. Each type renders appropriate HTML form elements with Bootstrap 5 styling and handles value collection automatically.

## Common Properties

Every parameter can have these properties:

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display label. Default: key converted from `snake_case` to `Title Case` |
| `type` | string | **Required.** One of the types listed below |
| `mode` | string | Type-specific modifier (e.g., `range`, `single`, `multi`) |
| `required` | boolean | Shows `*` and validates before query execution |
| `default` | varies | Default value set on render |

## Primitive Types

### `string`

A single-line text input.

```json
{
    "part_number": {
        "label": "Part Number",
        "type": "string",
        "required": true,
        "default": ""
    }
}
```

**Renders:** `<input type="text" class="form-control">`
**Value:** The text string, or `undefined` if empty.

---

### `int`

Whole number input. Supports `mode: "range"` for min/max.

```json
{
    "min_qty": {
        "label": "Minimum Quantity",
        "type": "int",
        "default": "0"
    }
}
```

**Renders:** `<input type="number" step="1" class="form-control">`
**Value:** The number as a string (all values are stringified for `FB.query()`).

**Range mode:**
```json
{
    "qty": {
        "label": "Quantity",
        "type": "int",
        "mode": "range"
    }
}
```
Renders two inputs with a "to" divider. Creates `:qty_start` and `:qty_end` SQL placeholders.

---

### `decimal`

Decimal number input with `step="0.01"`. Supports `mode: "range"`.

```json
{
    "unit_price": {
        "label": "Unit Price",
        "type": "decimal"
    }
}
```

**Renders:** `<input type="number" step="0.01" class="form-control">`

---

### `date`

Date picker. This is the most commonly used range type.

Date ranges automatically get a **relative-date preset picker** above the
from/to inputs, at parity with Fishbowl's `UtilDateRange` list and grouped
by period: All, Today, Yesterday; This/Last/Next Week, week-to-date
variants, Next 4 Weeks; This/Last/Next Month (+to-date); This/Last/Next
Quarter (+to-date); This/Last/Next Year (+to-date); Last/Next 30 and 365
Days — plus composable **Last N… / Next N…** entries that reveal a count +
unit (Days/Weeks/Months/Quarters/Years) row for rolling windows anchored
on today.

Picking a preset fills both inputs ('All' clears them); editing either
input switches back to Custom. Weeks start on Sunday and quarters are
calendar quarters, matching Fishbowl. The computed dates are plain values
in the inputs, so demo filtering and SQL binding are unaffected.
`CloudPages.presetDates(key[, n, unit])` exposes the computation.

```json
{
    "date_issued": {
        "label": "Date Issued",
        "type": "date",
        "mode": "range"
    }
}
```

**Single mode** renders: `<input type="date">`
**Range mode** renders: two date inputs with a "to" divider

**SQL for range dates:**
```sql
WHERE DATE(so.dateIssued) BETWEEN :date_issued_start AND :date_issued_end
```

---

### `time`

Time picker. Supports `mode: "range"`.

```json
{
    "shift_time": {
        "label": "Shift Time",
        "type": "time",
        "mode": "range"
    }
}
```

**Renders:** `<input type="time">`

---

### `timestamp`

Combined date and time picker. Supports `mode: "range"`.

```json
{
    "created_at": {
        "label": "Created",
        "type": "timestamp",
        "mode": "range"
    }
}
```

**Renders:** `<input type="datetime-local">`

---

### `checkbox`

Boolean toggle. Returns `true` or `false`.

```json
{
    "active_only": {
        "label": "Active Only",
        "type": "checkbox",
        "default": true
    }
}
```

**Renders:** `<input type="checkbox" class="form-check-input">`
**Value:** `true` or `false` (stringified to `"true"` / `"false"` in SQL bindings).

**SQL usage:**
```sql
WHERE part.activeFlag = :active_only
```

## SQL-Driven Types

These types populate their options from database queries.

### `dropdown`

Select input populated from a SQL query. Supports single and multi-select.

**Single select:**
```json
{
    "customer": {
        "label": "Customer",
        "type": "dropdown",
        "mode": "single",
        "required": true,
        "sql": "SELECT id, name FROM customer WHERE activeFlag = 1 ORDER BY name",
        "value": "id",
        "display": "name"
    }
}
```

**Multi-select:**
```json
{
    "locations": {
        "label": "Locations",
        "type": "dropdown",
        "mode": "multi",
        "sql": "SELECT id, name FROM location WHERE activeFlag = 1 ORDER BY name",
        "value": "id",
        "display": "name"
    }
}
```

| Property | Description |
|----------|-------------|
| `sql` | SQL query to fetch options |
| `value` | Column name to use as the `<option>` value |
| `display` | Comma-separated column names for display text |
| `mode` | `"single"` (default) or `"multi"` |

**Value:** Single mode returns a string. Multi mode returns an array of strings.

**Multi-value SQL binding:** When a multi-select dropdown returns `["10", "20", "30"]`, the SQL placeholder `:locations` is expanded:

```sql
-- Config query:
WHERE location.id IN (:locations)

-- After binding with ["10", "20", "30"]:
WHERE location.id IN (:locations_0, :locations_1, :locations_2)
-- bindings: { locations_0: "10", locations_1: "20", locations_2: "30" }
```

**Multiple display columns:**
```json
{
    "display": "name,description"
}
```
Renders each option as `"Widget A, Standard widget"`.

---

### `autocomplete`

Type-ahead search input. Queries the database, filters results client-side, and lets the user select from a dropdown list.

```json
{
    "part": {
        "label": "Part",
        "type": "autocomplete",
        "sql": "SELECT num, description FROM part WHERE activeFlag = 1",
        "value": "num",
        "display": "num,description",
        "search": "description",
        "minChars": 2
    }
}
```

| Property | Description |
|----------|-------------|
| `sql` | SQL query to fetch searchable data |
| `value` | Column name for the selected value (stored in `data-selected-id`) |
| `display` | Comma-separated columns for display text |
| `search` | Column to filter against when the user types |
| `minChars` | Minimum characters before search triggers (default: `1`) |

**Keyboard navigation:**
- `Arrow Down` / `Arrow Up` — navigate results
- `Enter` — select highlighted item
- `Escape` — close results dropdown

**Value:** Returns the `value` column of the selected item (stored as `data-selected-id` on the input element). If nothing is selected, returns the raw text input.

**Debouncing:** Search triggers 250ms after the user stops typing to avoid excessive queries.

## Range Mode Details

Range mode is available for: `int`, `decimal`, `date`, `time`, `timestamp`.

When you set `mode: "range"`, cloudpages.js:

1. **Renders** two inputs with a "to" divider between them
2. **Assigns IDs** as `{key}_start` and `{key}_end`
3. **Collects values** as two separate keys: `{key}_start` and `{key}_end`
4. **Binds to SQL** as `:{key}_start` and `:{key}_end`

```json
{
    "total_price": {
        "label": "Total Price",
        "type": "decimal",
        "mode": "range"
    }
}
```

```sql
WHERE so.totalPrice BETWEEN :total_price_start AND :total_price_end
```

## Validation

When `required: true` is set:
- An asterisk (`*`) appears next to the label
- Clicking **Run** validates all required fields
- Empty fields show an error message below the input
- The query does not execute until all required fields are filled

Validation rules:
- **Text/number:** non-empty string
- **Checkbox:** always passes (false is a valid value)
- **Dropdown:** must select a non-placeholder option
- **Multi-select:** at least one option selected
- **Range:** at least one of start/end must have a value
- **Autocomplete:** non-empty text or selected item

## Custom Parameter Types

You can register your own parameter types. See [Hooks & Customization](hooks-and-customization.md#custom-parameter-types).
