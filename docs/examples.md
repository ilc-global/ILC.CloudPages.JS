# CloudPages Examples

Complete, copy-paste examples for common Fishbowl reports. Each example is a self-contained HTML file — just save it, copy it to your CloudPages plugin directory, and open it in Fishbowl.

## Example 1: Open Sales Orders Report

A report showing open sales orders filtered by customer and date range, with currency formatting and Excel export.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="fb_path" content="Reports/Sales">
    <meta name="fb_modules" content="Sales Order">
    <meta name="fb_title" content="Open Sales Orders">
    <meta name="fb_description" content="Open sales orders by customer and date range">
    <meta name="window_state" content="maximized">
    <title>Open Sales Orders</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap5.min.js"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
    <script src="js/fb.js"></script>
    <script src="js/cloudpages.js"></script>
    <link rel="stylesheet" href="css/cloudpages.css">
</head>
<body>
    <div class="container mt-3">
        <h4>Open Sales Orders</h4>
        <div id="parametersContainer" class="mb-3"></div>
        <div class="mb-3">
            <button id="submitButton" class="btn btn-primary">Run</button>
            <button id="exportBtn" class="btn btn-secondary">Export to Excel</button>
        </div>
        <div id="tableContainer"></div>
    </div>

    <script id="settings" type="application/json">
    {
        "load_on_open": false,
        "page_length": 50,
        "enable_xlsx_export": true,
        "amount_unit_format": "$0.00"
    }
    </script>

    <script id="parameters" type="application/json">
    {
        "customer": {
            "label": "Customer",
            "type": "dropdown",
            "mode": "single",
            "sql": "SELECT id, name FROM customer WHERE activeFlag = 1 ORDER BY name",
            "value": "id",
            "display": "name"
        },
        "date_issued": {
            "label": "Date Issued",
            "type": "date",
            "mode": "range",
            "required": true
        }
    }
    </script>

    <script id="query" type="text/plain">
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
    AND DATE(so.dateIssued) BETWEEN :date_issued_start AND :date_issued_end
    ORDER BY so.dateIssued DESC
    LIMIT 500
    </script>

    <script id="columns" type="application/json">
    {
        "so_num": { "label": "SO #", "width": "100px" },
        "total_price": { "label": "Total", "format": "currency" },
        "total_tax": { "label": "Tax", "format": "currency" },
        "date_issued": { "format": "date" }
    }
    </script>
</body>
</html>
```

## Example 2: Inventory by Location

A dashboard-style report that loads automatically and shows current inventory for a selected location.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="fb_path" content="Reports/Inventory">
    <meta name="fb_modules" content="Inventory">
    <meta name="fb_title" content="Inventory by Location">
    <meta name="fb_description" content="Current inventory levels by location">
    <meta name="window_state" content="maximized">
    <title>Inventory by Location</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap5.min.js"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
    <script src="js/fb.js"></script>
    <script src="js/cloudpages.js"></script>
    <link rel="stylesheet" href="css/cloudpages.css">
</head>
<body>
    <div class="container mt-3">
        <h4>Inventory by Location</h4>
        <div id="parametersContainer" class="mb-3"></div>
        <div class="mb-3">
            <button id="submitButton" class="btn btn-primary">Run</button>
            <button id="exportBtn" class="btn btn-secondary">Export</button>
        </div>
        <div id="tableContainer"></div>
    </div>

    <script id="settings" type="application/json">
    {
        "load_on_open": false,
        "page_length": 100,
        "enable_xlsx_export": true,
        "qty_unit_format": "0.00"
    }
    </script>

    <script id="parameters" type="application/json">
    {
        "location": {
            "label": "Location",
            "type": "dropdown",
            "mode": "single",
            "required": true,
            "sql": "SELECT id, name FROM location WHERE activeFlag = 1 ORDER BY name",
            "value": "id",
            "display": "name"
        }
    }
    </script>

    <script id="query" type="text/plain">
    SELECT
        part.num AS part_num,
        part.description AS description,
        tag.qty AS qty_on_hand,
        tag.qtyCommitted AS qty_committed,
        (tag.qty - tag.qtyCommitted) AS qty_available,
        uom.code AS uom,
        part.stdCost AS unit_cost,
        tag.qty * part.stdCost AS total_value
    FROM tag
        JOIN part ON part.id = tag.partId
        JOIN uom ON uom.id = tag.uomId
    WHERE tag.locationId = :location
    AND tag.qty > 0
    ORDER BY part.num
    LIMIT 2000
    </script>

    <script id="columns" type="application/json">
    {
        "part_num": { "label": "Part #", "width": "120px" },
        "qty_on_hand": { "label": "On Hand", "format": "number" },
        "qty_committed": { "label": "Committed", "format": "number" },
        "qty_available": { "label": "Available", "format": "number" },
        "unit_cost": { "format": "currency" },
        "total_value": { "label": "Total Value", "format": "currency" }
    }
    </script>
</body>
</html>
```

## Example 3: Part Lookup with Autocomplete

Uses the autocomplete parameter type for a fast part search experience.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="fb_path" content="Tools/Parts">
    <meta name="fb_modules" content="Inventory">
    <meta name="fb_title" content="Part Lookup">
    <meta name="fb_description" content="Search parts and view inventory across locations">
    <meta name="window_state" content="maximized">
    <title>Part Lookup</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap5.min.js"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
    <script src="js/fb.js"></script>
    <script src="js/cloudpages.js"></script>
    <link rel="stylesheet" href="css/cloudpages.css">
</head>
<body>
    <div class="container mt-3">
        <h4>Part Lookup</h4>
        <div id="parametersContainer" class="mb-3"></div>
        <div class="mb-3">
            <button id="submitButton" class="btn btn-primary">Search</button>
            <button id="exportBtn" class="btn btn-secondary">Export</button>
        </div>
        <div id="tableContainer"></div>
    </div>

    <script id="settings" type="application/json">
    {
        "load_on_open": false,
        "page_length": 25,
        "enable_xlsx_export": true,
        "qty_unit_format": "0.00"
    }
    </script>

    <script id="parameters" type="application/json">
    {
        "part": {
            "label": "Part",
            "type": "autocomplete",
            "required": true,
            "sql": "SELECT num, description FROM part WHERE activeFlag = 1 ORDER BY num",
            "value": "num",
            "display": "num,description",
            "search": "description",
            "minChars": 2
        }
    }
    </script>

    <script id="query" type="text/plain">
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
    WHERE part.num = :part
    AND tag.qty > 0
    ORDER BY location.name
    </script>

    <script id="columns" type="application/json">
    {
        "part_num": { "label": "Part #", "width": "120px" },
        "qty_on_hand": { "label": "On Hand", "format": "number" },
        "qty_committed": { "label": "Committed", "format": "number" },
        "qty_available": { "label": "Available", "format": "number" }
    }
    </script>
</body>
</html>
```

## Example 4: Hooks — Profit Margin Report

Uses `onAfterQuery` to add computed columns and `onExport` to add a summary row.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="fb_path" content="Reports/Financial">
    <meta name="fb_modules" content="Sales Order">
    <meta name="fb_title" content="Profit Margins">
    <meta name="fb_description" content="Sales order profitability by product">
    <meta name="window_state" content="maximized">
    <title>Profit Margins</title>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap5.min.js"></script>
    <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
    <script src="js/fb.js"></script>
    <script src="js/cloudpages.js"></script>
    <link rel="stylesheet" href="css/cloudpages.css">
</head>
<body>
    <div class="container mt-3">
        <h4>Profit Margins by Product</h4>
        <div id="parametersContainer" class="mb-3"></div>
        <div class="mb-3">
            <button id="submitButton" class="btn btn-primary">Run</button>
            <button id="exportBtn" class="btn btn-secondary">Export</button>
        </div>
        <div id="tableContainer"></div>
    </div>

    <script id="settings" type="application/json">
    {
        "load_on_open": false,
        "page_length": 50,
        "enable_xlsx_export": true,
        "amount_unit_format": "$0.00"
    }
    </script>

    <script id="parameters" type="application/json">
    {
        "date_range": {
            "label": "Date Range",
            "type": "date",
            "mode": "range",
            "required": true
        }
    }
    </script>

    <script id="query" type="text/plain">
    SELECT
        soitem.productNum AS product_num,
        soitem.description AS description,
        SUM(soitem.qtyFulfilled) AS qty_sold,
        SUM(soitem.totalPrice) AS total_revenue,
        SUM(soitem.totalCost) AS total_cost
    FROM soitem
        JOIN so ON so.id = soitem.soId
    WHERE so.statusId >= 20
    AND DATE(so.dateIssued) BETWEEN :date_range_start AND :date_range_end
    AND soitem.qtyFulfilled > 0
    GROUP BY soitem.productNum, soitem.description
    ORDER BY total_revenue DESC
    LIMIT 200
    </script>

    <script id="columns" type="application/json">
    {
        "product_num": { "label": "Product" },
        "qty_sold": { "label": "Qty Sold", "format": "number" },
        "total_revenue": { "label": "Revenue", "format": "currency" },
        "total_cost": { "label": "COGS", "format": "currency" },
        "profit": { "label": "Profit", "format": "currency" },
        "margin": { "label": "Margin", "format": "percent" }
    }
    </script>

    <script>
        // Add computed columns after query
        CloudPages.hooks.onAfterQuery = function(rows) {
            return rows.map(function(row) {
                var revenue = parseFloat(row.total_revenue) || 0;
                var cost = parseFloat(row.total_cost) || 0;
                row.profit = revenue - cost;
                row.margin = revenue > 0 ? (row.profit / revenue) : 0;
                return row;
            });
        };

        // Add totals row to export
        CloudPages.hooks.onExport = function(rows, format) {
            if (rows.length === 0) return rows;
            var totals = {
                product_num: 'TOTAL',
                description: '',
                qty_sold: rows.reduce(function(s, r) { return s + (parseFloat(r.qty_sold) || 0); }, 0),
                total_revenue: rows.reduce(function(s, r) { return s + (parseFloat(r.total_revenue) || 0); }, 0),
                total_cost: rows.reduce(function(s, r) { return s + (parseFloat(r.total_cost) || 0); }, 0)
            };
            totals.profit = totals.total_revenue - totals.total_cost;
            totals.margin = totals.total_revenue > 0 ? (totals.profit / totals.total_revenue) : 0;
            rows.push(totals);
            return rows;
        };
    </script>
</body>
</html>
```

## Example 5: Multi-Select Status Filter

Uses a multi-select dropdown with IN clause expansion.

```html
<!-- Parameters block only — rest of page follows standard pattern -->
<script id="parameters" type="application/json">
{
    "statuses": {
        "label": "Order Status",
        "type": "dropdown",
        "mode": "multi",
        "required": true,
        "sql": "SELECT DISTINCT so.statusId AS id, statusname.name FROM so JOIN statusname ON statusname.id = so.statusId ORDER BY statusname.name",
        "value": "id",
        "display": "name"
    },
    "date_range": {
        "label": "Date Range",
        "type": "date",
        "mode": "range"
    }
}
</script>

<script id="query" type="text/plain">
SELECT
    so.num AS so_num,
    customer.name AS customer_name,
    statusname.name AS status,
    so.dateIssued AS date_issued,
    so.totalPrice AS total_price
FROM so
    JOIN customer ON customer.id = so.customerId
    JOIN statusname ON statusname.id = so.statusId
WHERE so.statusId IN (:statuses)
AND DATE(so.dateIssued) BETWEEN :date_range_start AND :date_range_end
ORDER BY so.dateIssued DESC
LIMIT 500
</script>
```

When the user selects statuses "Issued" (20) and "In Progress" (25), cloudpages.js expands `:statuses` to `:statuses_0, :statuses_1` with bindings `{ statuses_0: "20", statuses_1: "25" }`.
