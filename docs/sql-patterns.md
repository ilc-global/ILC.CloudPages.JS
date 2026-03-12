# SQL Patterns for CloudPages

Common SQL patterns for building CloudPages reports against a Fishbowl database. All queries use parameterized placeholders (`:paramName`) — **never concatenate user input into SQL**.

## Important Notes

- **Column aliases:** Use `AS` to name your columns. The alias becomes the key in result rows and the key in your `columns` config. Fishbowl returns lowercase column names, so use aliases to get predictable names.
- **Parameterized queries:** All values passed through `FB.query()` are `Map<String, String>` — every value is a string. Fishbowl's MySQL will handle type coercion.
- **LIMIT:** Always include a `LIMIT` clause to prevent runaway queries.

## Sales Orders

### Open Sales Orders
```sql
SELECT
    so.num AS so_num,
    customer.name AS customer_name,
    so.dateIssued AS date_issued,
    so.totalPrice AS total_price,
    so.totalTax AS total_tax,
    statusname.name AS status
FROM so
    JOIN customer ON customer.id = so.customerId
    LEFT JOIN statusname ON statusname.id = so.statusId
WHERE so.statusId IN (20, 25)
AND DATE(so.dateIssued) BETWEEN :date_start AND :date_end
ORDER BY so.dateIssued DESC
LIMIT 500
```

### Sales Order Line Items
```sql
SELECT
    so.num AS so_num,
    soitem.productNum AS product_num,
    soitem.description AS description,
    soitem.qtyOrdered AS qty_ordered,
    soitem.qtyFulfilled AS qty_fulfilled,
    (soitem.qtyOrdered - soitem.qtyFulfilled) AS qty_open,
    soitem.unitPrice AS unit_price,
    soitem.totalPrice AS line_total
FROM soitem
    JOIN so ON so.id = soitem.soId
WHERE so.customerId = :customer
AND DATE(so.dateIssued) BETWEEN :date_issued_start AND :date_issued_end
ORDER BY so.num, soitem.lineItem
LIMIT 1000
```

### Sales by Customer (Summary)
```sql
SELECT
    customer.name AS customer_name,
    COUNT(DISTINCT so.id) AS order_count,
    SUM(so.totalPrice) AS total_revenue,
    SUM(so.totalTax) AS total_tax,
    MIN(so.dateIssued) AS first_order,
    MAX(so.dateIssued) AS last_order
FROM so
    JOIN customer ON customer.id = so.customerId
WHERE DATE(so.dateIssued) BETWEEN :date_start AND :date_end
AND so.statusId >= 20
GROUP BY customer.name
ORDER BY total_revenue DESC
LIMIT 100
```

## Purchase Orders

### Open Purchase Orders
```sql
SELECT
    po.num AS po_num,
    vendor.name AS vendor_name,
    po.dateIssued AS date_issued,
    po.dateLastModified AS last_modified,
    statusname.name AS status
FROM po
    JOIN vendor ON vendor.id = po.vendorId
    LEFT JOIN statusname ON statusname.id = po.statusId
WHERE po.statusId IN (20, 25)
ORDER BY po.dateIssued DESC
LIMIT 500
```

### PO Line Items with Receiving Status
```sql
SELECT
    po.num AS po_num,
    vendor.name AS vendor_name,
    poitem.partNum AS part_num,
    poitem.description AS description,
    poitem.qtyOrdered AS qty_ordered,
    poitem.qtyFulfilled AS qty_received,
    (poitem.qtyOrdered - poitem.qtyFulfilled) AS qty_outstanding,
    poitem.unitCost AS unit_cost,
    poitem.totalCost AS line_total
FROM poitem
    JOIN po ON po.id = poitem.poId
    JOIN vendor ON vendor.id = po.vendorId
WHERE po.vendorId = :vendor
AND po.statusId IN (20, 25)
ORDER BY po.num, poitem.lineItem
LIMIT 1000
```

## Inventory

### Current Inventory by Location
```sql
SELECT
    part.num AS part_num,
    part.description AS description,
    location.name AS location,
    tag.qty AS qty_on_hand,
    tag.qtyCommitted AS qty_committed,
    (tag.qty - tag.qtyCommitted) AS qty_available,
    uom.code AS uom
FROM tag
    JOIN part ON part.id = tag.partId
    JOIN location ON location.id = tag.locationId
    JOIN uom ON uom.id = tag.uomId
WHERE location.id = :location
AND tag.qty > 0
ORDER BY part.num
LIMIT 1000
```

### Inventory Value Summary
```sql
SELECT
    part.num AS part_num,
    part.description AS description,
    SUM(tag.qty) AS total_qty,
    part.stdCost AS unit_cost,
    SUM(tag.qty) * part.stdCost AS total_value
FROM tag
    JOIN part ON part.id = tag.partId
WHERE tag.qty > 0
AND part.activeFlag = 1
GROUP BY part.num, part.description, part.stdCost
ORDER BY total_value DESC
LIMIT 500
```

## Shipping & Fulfillment

### Recent Shipments
```sql
SELECT
    ship.num AS ship_num,
    so.num AS so_num,
    customer.name AS customer_name,
    carrier.name AS carrier,
    ship.dateShipped AS date_shipped,
    statusname.name AS status
FROM ship
    JOIN so ON so.id = ship.soId
    JOIN customer ON customer.id = so.customerId
    LEFT JOIN carrier ON carrier.id = ship.carrierId
    LEFT JOIN statusname ON statusname.id = ship.statusId
WHERE DATE(ship.dateShipped) BETWEEN :date_start AND :date_end
ORDER BY ship.dateShipped DESC
LIMIT 500
```

## Manufacturing

### Work Order Status
```sql
SELECT
    wo.num AS wo_num,
    wo.description AS description,
    wo.dateScheduled AS date_scheduled,
    wo.dateFinished AS date_finished,
    wo.qtyOrdered AS qty_ordered,
    wo.qtyTarget AS qty_target,
    statusname.name AS status
FROM wo
    LEFT JOIN statusname ON statusname.id = wo.statusId
WHERE wo.statusId = :status
ORDER BY wo.dateScheduled DESC
LIMIT 500
```

## Parameter Population Queries

These are for populating dropdowns and autocomplete fields in your `parameters` config.

### Customers
```sql
SELECT id, name FROM customer WHERE activeFlag = 1 ORDER BY name
```

### Vendors
```sql
SELECT id, name FROM vendor WHERE activeFlag = 1 ORDER BY name
```

### Locations
```sql
SELECT id, name FROM location WHERE activeFlag = 1 ORDER BY name
```

### Location Groups
```sql
SELECT id, name FROM locationgroup WHERE activeFlag = 1 ORDER BY name
```

### Parts (for autocomplete)
```sql
SELECT num, description FROM part WHERE activeFlag = 1 ORDER BY num
```

### Products (for autocomplete)
```sql
SELECT num, description FROM product WHERE activeFlag = 1 ORDER BY num
```

### Carriers
```sql
SELECT id, name FROM carrier ORDER BY name
```

### Status Names
```sql
SELECT id, name FROM statusname ORDER BY name
```

### Users / Sales Reps
```sql
SELECT id, CONCAT(firstName, ' ', lastName) AS name
FROM sysuser WHERE activeFlag = 1 ORDER BY lastName
```

## Multi-Select IN Clause

When using a multi-select dropdown, cloudpages.js automatically expands array values for `IN` clauses:

**Parameter config:**
```json
{
    "statuses": {
        "label": "Status",
        "type": "dropdown",
        "mode": "multi",
        "sql": "SELECT id, name FROM statusname WHERE id IN (10, 20, 25, 30, 60) ORDER BY name",
        "value": "id",
        "display": "name"
    }
}
```

**Query:**
```sql
SELECT so.num, statusname.name AS status
FROM so
    JOIN statusname ON statusname.id = so.statusId
WHERE so.statusId IN (:statuses)
LIMIT 500
```

If the user selects statuses 20 and 25, the engine expands this to:
```sql
WHERE so.statusId IN (:statuses_0, :statuses_1)
-- bindings: { statuses_0: "20", statuses_1: "25" }
```

## Tips

- **Always alias columns** — Fishbowl returns lowercase names. `so.totalPrice` becomes `totalprice` unless you use `AS total_price`.
- **Use LIMIT** — protect against queries that return millions of rows.
- **Date functions** — use `DATE()` to compare date-only values: `DATE(so.dateIssued) BETWEEN :start AND :end`.
- **JOINs** — prefer `JOIN` over subqueries for better readability. Use `LEFT JOIN` when the related record might not exist.
- **Test your SQL** — run queries in Fishbowl's SQL console first to verify they return the expected columns and data.
