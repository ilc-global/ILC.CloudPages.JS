# Demo Mode

Outside JXBrowser (plain browser, no Fishbowl), a report can run entirely from
bundled demo data — parameter dropdowns populate, filters actually filter, and
export works. This is the development and sales-demo path.

Requires fb.js with function-valued demo query entries (DemoAdapter forwards
query params — ILC.Fishbowl.JS `demo-query-params` or later).

## Providing demo data

Two sources, checked only when not running in JXBrowser:

1. **Inline** — `<script id="demo" type="application/json">` in the page
   (wins if both are present). Good for small pages and test fixtures.
2. **External file** — `"demo_data": "path/to/demo-data.json"` in `settings`.
   Fetched lazily, so production pages never load or parse demo rows. Preferred
   for products. Note `fetch()` requires the page to be served over HTTP.

If neither is present, init proceeds unchanged (a page served by a web adapter
deployment may be intentional).

## JSON shape

```json
{
    "query": [ { "po_num": "PO-1001", "vendor_id": 1, "date_expected": "2026-07-10" } ],
    "parameters": {
        "vendor": [ { "id": 1, "name": "Acme Fasteners" } ]
    },
    "user": { "companyName": "Demo Co", "username": "demo" },
    "context": { "moduleName": "Purchase Order" }
}
```

- `query` — result rows for the report (column names matching your SELECT aliases).
- `parameters.<name>` — rows for that parameter's SQL (dropdown/autocomplete),
  keyed by parameter name, not SQL text.
- `user` / `context` — optional, passed through to fb.js demo config.

## How filtering works

The engine registers the `query` rows behind a generated filter function that
mirrors your WHERE clause: each parameter filters the demo-row column named by
its **`demo_column`** config field (default: the parameter name), using a
predicate derived from the parameter type:

| Type / mode | Predicate |
|---|---|
| any `mode: "range"` | column between `_start`/`_end` (numeric for int/decimal; ISO string prefix compare for date/time/timestamp) |
| `dropdown` single / `autocomplete` | equality against the option `value` |
| `dropdown` multi | membership in the selected values |
| `string` | case-insensitive contains |
| `checkbox` | checked → column truthy; unchecked → no filter |
| others (`int`, `decimal`, …) | equality |

Empty parameter values apply no filter, matching the `:param IS NULL OR …` SQL
convention.

Set `demo_column` when the filtered column differs from the parameter name —
e.g. a `vendor` dropdown whose value is an id should declare
`"demo_column": "vendor_id"` and include `vendor_id` in each demo row.

## Reference

`tests/pages/02_Demo.html` is a complete working example (inline source).
