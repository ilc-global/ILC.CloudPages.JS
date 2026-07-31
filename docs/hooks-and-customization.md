# Hooks & Customization

CloudPages provides hooks at each stage of the lifecycle and a renderer registry for custom parameter types. This lets you extend behavior without modifying cloudpages.js.

## Hooks

Hooks are functions on `CloudPages.hooks` that fire at specific lifecycle points. Override them in a `<script>` block after loading cloudpages.js.

```html
<script src="https://cdn.ilcreports.com/fb/v2026.07.31.7/fb.js"></script>
<script src="js/cloudpages.js"></script>
<script>
    // Your hooks go here
    CloudPages.hooks.onAfterQuery = function(rows) {
        // ...
    };
</script>
```

### `onBeforeQuery(sql, params)` → `{ sql, params }`

Fires after the user clicks Run and parameters are collected, but before SQL binding and execution. Use this to dynamically modify the query or parameters.

**Arguments:**
- `sql` — the raw SQL template from `<script id="query">`
- `params` — the collected parameter values (flat object)

**Must return:** `{ sql: string, params: object }`

**Example: Add a dynamic WHERE clause**
```javascript
CloudPages.hooks.onBeforeQuery = function(sql, params) {
    // Only show active records unless the user unchecked the box
    if (params.active_only === true || params.active_only === 'true') {
        sql = sql.replace('LIMIT', 'AND part.activeFlag = 1\nLIMIT');
    }
    return { sql: sql, params: params };
};
```

**Example: Set default date range if empty**
```javascript
CloudPages.hooks.onBeforeQuery = function(sql, params) {
    if (!params.date_start) {
        var d = new Date();
        d.setDate(d.getDate() - 30);
        params.date_start = d.toISOString().split('T')[0];
    }
    if (!params.date_end) {
        params.date_end = new Date().toISOString().split('T')[0];
    }
    return { sql: sql, params: params };
};
```

---

### `onAfterQuery(rows)` → `rows`

Fires after the query returns, before the table renders. Use this to filter, sort, or transform the entire result set.

**Arguments:**
- `rows` — array of result row objects

**Must return:** the (possibly modified) array of rows.

**Example: Add a computed column**
```javascript
CloudPages.hooks.onAfterQuery = function(rows) {
    return rows.map(function(row) {
        row.profit = (row.total_price || 0) - (row.total_cost || 0);
        row.margin = row.total_price > 0
            ? (row.profit / row.total_price)
            : 0;
        return row;
    });
};
```

**Example: Filter out zero-quantity rows**
```javascript
CloudPages.hooks.onAfterQuery = function(rows) {
    return rows.filter(function(row) {
        return row.qty_open > 0;
    });
};
```

**Example: Sort by a custom rule**
```javascript
CloudPages.hooks.onAfterQuery = function(rows) {
    return rows.sort(function(a, b) {
        // Priority orders first, then by date
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(a.date_issued) - new Date(b.date_issued);
    });
};
```

---

### `onRenderRow(row, index)` → `row`

Fires for each row as the table renders. Use this for per-row transformations like conditional formatting, computed display values, or row filtering.

**Arguments:**
- `row` — a single result row object
- `index` — the row's zero-based index

**Must return:** the row object, or `null` to exclude the row from the table.

**Example: Conditional computed value**
```javascript
CloudPages.hooks.onRenderRow = function(row, index) {
    // Add a status label based on quantity
    if (row.qty_open === 0) {
        row.fill_status = 'Complete';
    } else if (row.qty_open < row.qty_ordered) {
        row.fill_status = 'Partial';
    } else {
        row.fill_status = 'Open';
    }
    return row;
};
```

**Example: Exclude rows**
```javascript
CloudPages.hooks.onRenderRow = function(row, index) {
    // Skip cancelled orders
    if (row.status === 'Cancelled') return null;
    return row;
};
```

---

### `onExport(rows, format)` → `rows`

Fires when the user clicks Export, before the file is generated. Use this to modify what gets exported — add summary rows, remove internal columns, or reformat values.

**Arguments:**
- `rows` — array of result row objects
- `format` — `"xlsx"` or `"csv"`

**Must return:** the (possibly modified) array of rows.

**Example: Remove internal columns from export**
```javascript
CloudPages.hooks.onExport = function(rows, format) {
    return rows.map(function(row) {
        var clean = Object.assign({}, row);
        delete clean.internal_id;
        delete clean.sort_key;
        return clean;
    });
};
```

**Example: Add a summary row to XLSX export**
```javascript
CloudPages.hooks.onExport = function(rows, format) {
    if (format === 'xlsx' && rows.length > 0) {
        var totalRevenue = rows.reduce(function(sum, r) { return sum + (r.total_price || 0); }, 0);
        var totalTax = rows.reduce(function(sum, r) { return sum + (r.total_tax || 0); }, 0);
        rows.push({
            so_num: 'TOTAL',
            customer_name: '',
            total_price: totalRevenue,
            total_tax: totalTax,
            date_issued: ''
        });
    }
    return rows;
};
```

**Example: Format dates differently for CSV**
```javascript
CloudPages.hooks.onExport = function(rows, format) {
    if (format === 'csv') {
        return rows.map(function(row) {
            var r = Object.assign({}, row);
            if (r.date_issued) {
                r.date_issued = new Date(r.date_issued).toISOString().split('T')[0];
            }
            return r;
        });
    }
    return rows;
};
```

## Custom Parameter Types

Register custom parameter types using `CloudPages.registerRenderer()`. Each renderer has two methods:

- `render(key, cfg)` — creates and returns a DOM element
- `getValue(key, cfg)` — returns the current value from the DOM

### Example: Color Picker

```javascript
CloudPages.registerRenderer('color', {
    render: function(key, cfg) {
        var input = document.createElement('input');
        input.type = 'color';
        input.id = key;
        input.className = 'form-control form-control-color';
        if (cfg.default) input.value = cfg.default;
        return input;
    },
    getValue: function(key) {
        var el = document.getElementById(key);
        return el ? el.value : undefined;
    }
});
```

```json
{
    "highlight_color": {
        "label": "Highlight Color",
        "type": "color",
        "default": "#ff0000"
    }
}
```

### Example: Textarea

```javascript
CloudPages.registerRenderer('textarea', {
    render: function(key, cfg) {
        var textarea = document.createElement('textarea');
        textarea.id = key;
        textarea.className = 'form-control';
        textarea.rows = cfg.rows || 3;
        textarea.placeholder = cfg.placeholder || '';
        if (cfg.default) textarea.value = cfg.default;
        return textarea;
    },
    getValue: function(key) {
        var el = document.getElementById(key);
        return el ? el.value : undefined;
    }
});
```

### Example: Radio Button Group

```javascript
CloudPages.registerRenderer('radio', {
    render: function(key, cfg) {
        var container = document.createElement('div');
        (cfg.options || []).forEach(function(opt, i) {
            var wrapper = document.createElement('div');
            wrapper.className = 'form-check';

            var input = document.createElement('input');
            input.type = 'radio';
            input.className = 'form-check-input';
            input.name = key;
            input.id = key + '_' + i;
            input.value = opt.value;
            if (cfg.default === opt.value) input.checked = true;

            var label = document.createElement('label');
            label.className = 'form-check-label';
            label.setAttribute('for', key + '_' + i);
            label.textContent = opt.label;

            wrapper.appendChild(input);
            wrapper.appendChild(label);
            container.appendChild(wrapper);
        });
        return container;
    },
    getValue: function(key) {
        var checked = document.querySelector('input[name="' + key + '"]:checked');
        return checked ? checked.value : undefined;
    }
});
```

```json
{
    "status_filter": {
        "label": "Status",
        "type": "radio",
        "default": "all",
        "options": [
            { "value": "all", "label": "All" },
            { "value": "open", "label": "Open Only" },
            { "value": "closed", "label": "Closed Only" }
        ]
    }
}
```

## Public API

CloudPages exposes these methods for advanced use cases where you need to control the lifecycle programmatically:

| Method | Description |
|--------|-------------|
| `CloudPages.init()` | Re-run the full init lifecycle |
| `CloudPages.loadConfig()` | Parse and return all 4 config blocks |
| `CloudPages.renderParameters(params, container)` | Render parameter form into a DOM element |
| `CloudPages.collectValues(params)` | Read current values from the rendered form |
| `CloudPages.validateParameters(params)` | Validate required fields, show errors |
| `CloudPages.bindParams(sql, values)` | Bind values to SQL placeholders |
| `CloudPages.executeQuery(sql, values, callback)` | Run a query with full hook chain |
| `CloudPages.renderTable(rows, columns, settings)` | Render a DataTable |
| `CloudPages.exportXLSX(rows, filename)` | Export rows as XLSX |
| `CloudPages.exportCSV(rows, filename)` | Export rows as CSV |
| `CloudPages.snakeToTitle(str)` | Convert `snake_case` to `Title Case` |
| `CloudPages.registerRenderer(type, renderer)` | Register a custom parameter type |
