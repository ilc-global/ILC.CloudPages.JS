# Custom Fields

A report can let the user add Fishbowl custom fields as columns and as filters.
The page author marks where they go in the query. The engine writes the SQL.

No custom field is read unless the user picked one. With nothing picked, the
markers are removed and the query runs unchanged.

## What the page author writes

A setting that maps a SQL alias in the query to a Fishbowl record
(`tablereference.tableRefName`):

```json
"custom_fields": { "so": "SO", "product": "Product" }
```

The alias is written into the generated SQL, so it must be a plain identifier.
The engine refuses the page if it is not.

Then up to three markers in `#query`:

| Marker | Where | The engine writes |
|---|---|---|
| `/*cf:select*/` | after the last SELECT column | `, CustomFieldById(so.customFields, :cf_so_51_id) AS cf_so_51` per chosen column |
| `/*cf:group*/` | after the last GROUP BY expression | `, CustomFieldById(so.customFields, :cf_so_51_id)` per chosen column |
| `/*cf:where*/` | among the WHERE conditions | one `AND ( ... )` block that holds every filter |

```sql
SELECT so.num AS order_num,
       product.num AS product,
       soitem.qtyOrdered AS qty
       /*cf:select*/
FROM soitem
JOIN so ON so.id = soitem.soId
JOIN product ON product.id = soitem.productId
WHERE 1 = 1
  AND so.dateIssued >= :date_range_start /*opt:date_range_start*/
  /*cf:where*/
ORDER BY so.num
```

A summary report adds `/*cf:group*/`, so a chosen column also joins the
`GROUP BY`. A filter alone does not change the grouping.

Field ids and filter values are bound as named parameters. Nothing the user
types is joined into the statement.

## What the user sees

The parameter panel gains a "Custom fields" row with an "Edit custom fields"
button. It opens a dialog with two parts.

**Columns.** One tick box per active custom field on the mapped records. A
ticked field becomes a column labelled `<Record>: <Field>`, formatted by its
type.

**Filters.** "Add filter" adds a row: field, condition, value. The conditions
and the value input follow the field type.

| Field type | Conditions | Value input |
|---|---|---|
| Text, Long Text, URL | contains, does not contain, is, is not, starts with, is empty, is not empty | text |
| Money, Quantity, Count | =, ≠, >, ≥, <, ≤, is between, is empty, is not empty | number |
| Date | is, is before, is after, is between, is empty, is not empty | date |
| Drop-Down List | is, is not, is empty, is not empty | the list's items |
| Checkbox | is checked, is not checked | none |

Each row after the first joins with AND or OR. AND is applied before OR, and
the dialog states the result in words. There are no nested groups, so
"A and (B or C)" cannot be built.

Apply keeps the choices for this visit. Nothing is remembered between visits.

The definitions load when the dialog first opens, not when the page opens.

## UNION queries

In a UNION, each branch lists the aliases it has, in every marker:

```sql
SELECT po.num AS order_num, part.num AS part_num
       /*cf:select po part*/
FROM receiptitem ri ...
WHERE 1 = 1
  /*cf:where po part*/

UNION ALL

SELECT xo.num AS order_num, part.num AS part_num
       /*cf:select part*/
FROM receiptitem ri ...
WHERE 1 = 1
  /*cf:where part*/
```

A chosen field from a record the branch does not have is written as NULL in
that branch: `NULL AS cf_po_71` at the select marker, so every branch keeps
the same columns, and `NULL` inside a filter condition. A filter "PO Source is
Import" therefore keeps PO rows only, and "PO Source is empty" keeps the rows
that have no PO.

A marker with no list means the query has every alias.

## Speed

Custom fields are stored in a JSON column with no index. A custom-field filter
with nothing else narrowing the rows reads the whole table. The engine does
not refuse it. Give the report a date range or another indexed filter.

## Demo mode

Demo data adds two keys beside `query`:

```json
{
    "query": [
        { "order_num": "SO-1001", "qty": 4, "cf_so_51": "West", "cf_product_63": "24.50" }
    ],
    "custom_fields": [
        { "id": 51, "name": "Region", "type_id": 7, "list_id": 9, "table_ref": "SO", "table_name": "Sales Order" },
        { "id": 63, "name": "MSRP", "type_id": 3, "list_id": null, "table_ref": "Product", "table_name": "Product" }
    ],
    "custom_lists": [
        { "list_id": 9, "name": "East" },
        { "list_id": 9, "name": "West" }
    ]
}
```

- Each demo row carries every custom field as a `cf_<alias>_<id>` key. The
  engine drops the keys the user did not choose and applies the filters to the
  rows.
- `type_id` is Fishbowl's custom field type: 1 Text, 2 Date, 3 Money,
  4 Quantity, 5 Count, 6 Checkbox, 7 Drop-Down List, 9 Long Text, 10 URL.
- A summary report sets `"demo_sum": ["qty", "revenue"]` in `settings`. After
  a field is dropped, demo rows that are now alike are merged and those
  columns are added up. The setting does nothing outside demo mode.

## How Fishbowl stores the values

Measured on Fishbowl 2026.10. Every value is a string.

| Type | Stored value |
|---|---|
| Text, Long Text, URL | the text |
| Date | `2026-11-27 00:00:00` |
| Money | `7.00` |
| Quantity | `24.23` |
| Count | `1` |
| Checkbox | `true` or `false` |
| Drop-Down List | the item's text |

A field nobody has filled in has no value, and `CustomFieldById` returns NULL.
A row can then come back without that column, so the engine gives every row
every chosen column before the table is built.

## Requirements

- A Fishbowl version whose records carry the `customFields` JSON column and
  the `CustomFieldById` database function.
- A browser with the `<dialog>` element.

## API

`CloudPages.customFields.expand(sql)` returns `{ sql, bindings }` for the
current choices. `CloudPages.customFields.state()` returns the chosen columns
and the complete filters. `CloudPages.customFields.summary()` returns the
one-line text shown under the button.
