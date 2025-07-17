# Fishbowl HTML/JS Report Architecture Documentation

## Executive Summary

This documentation details the architecture, patterns, and approaches used in the Fishbowl HTML/JavaScript reporting system. The system is designed for building rich, database-driven web applications that run within the Fishbowl Inventory JXBrowser component, using a custom Java/JavaScript bridge for backend integration.

## Related Documentation

- **[PluginBrowserBridge_Documentation.md](PluginBrowserBridge_Documentation.md)** - Complete reference for all `fb_client` methods, parameters, error handling, and usage patterns
- **Current Document** - Architecture patterns, project organization, and development approaches specific to HTML/JS report development

> **Note**: This document focuses on architectural patterns and organization. For detailed method signatures, parameters, and integration examples, refer to the PluginBrowserBridge documentation.

## 1. Project Structure and Organization

### Directory Structure

#### Modern Page-Specific Structure (Recommended)
```
/
├── *.html                          # Main HTML pages (entry points)
├── [PageName]/                     # Page-specific resources
│   ├── css/                       # Page-specific stylesheets
│   │   └── styles.css             # Main page styles
│   ├── js/                        # Page-specific JavaScript
│   │   ├── app.js                 # Main application logic
│   │   ├── config/                # Configuration objects
│   │   ├── controller/            # Business logic controllers
│   │   └── variables/             # Page state management
│   └── sql/                       # Page-specific SQL queries
│       ├── main_query.sql         # Primary data query
│       └── lookup_queries.sql     # Reference data queries
├── css/                           # Common/shared stylesheets
│   ├── bootstrap.min.css          # Bootstrap framework
│   ├── dashboard.css              # Common dashboard styles
│   └── shared-components.css      # Shared component styles
├── js/                           # Common/shared JavaScript
│   ├── utils/                    # Shared utility functions
│   │   ├── fishbowl.js          # Fishbowl bridge utilities
│   │   ├── date.js              # Date manipulation utilities
│   │   ├── string.js            # String processing utilities
│   │   └── query_builder.js     # SQL query building utilities
│   └── [external libraries]      # Third-party libraries
└── icons/                        # SVG icons and images
```

#### Single-Page Structure (For Simple Reports <1000 lines)
```
/
├── SimpleReport.html              # Complete page with embedded JS/SQL
├── css/                          # Common stylesheets only
│   ├── bootstrap.min.css
│   └── dashboard.css
├── js/                           # Common utilities only
│   └── utils/
└── icons/
```

### Key Architectural Principles

1. **Page-Specific Organization**: Each page has its own folder with dedicated resources
2. **Progressive Complexity**: Start with single-page approach, break out as complexity grows
3. **Separation of Concerns**: HTML, CSS, JavaScript, and SQL are logically separated
4. **Resource-Based SQL**: SQL queries stored as external files or embedded script tags
5. **Utility-First JavaScript**: Common functionality centralized in shared utils/
6. **Configuration-Driven UI**: UI components configured through objects
7. **Scalable Architecture**: Easy to refactor from single-page to multi-file as needed

### Organizational Decision Tree

**Simple Reports (< 1000 lines total):**
- Single HTML file with embedded `<script>` tags
- SQL queries in `<script type="text/plain">` tags
- JavaScript directly in `<script>` tags
- Minimal external dependencies

**Complex Reports (> 1000 lines or multiple features):**
- Page-specific folder structure
- Separate CSS, JavaScript, and SQL files
- Modular JavaScript architecture
- Multiple controllers and configuration files

## 2. HTML Page Structure and Patterns

### Single-Page Approach (Simple Reports)

For simple reports with basic functionality, everything can be contained in a single HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="fb_title" content="Simple Report">
    <meta name="fb_path" content="Reports:Category">
    <title>Simple Report</title>
    
    <!-- Common CSS only -->
    <link rel="stylesheet" href="css/bootstrap.min.css">
    <link rel="stylesheet" href="css/dashboard.css">
    
    <!-- Page-specific styles -->
    <style>
        .report-container {
            margin: 20px auto;
            max-width: 1200px;
        }
        .results-table {
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container-fluid report-container">
        <h1>Simple Report</h1>
        
        <div class="filters">
            <button id="runReport" class="btn btn-primary">Run Report</button>
        </div>
        
        <div id="results" class="results-table">
            <!-- Results populated by JavaScript -->
        </div>
    </div>

    <!-- Embedded SQL Queries -->
    <script id="mainQuery" type="text/plain">
        SELECT 
            customer.name,
            SUM(postsoitem.unitprice * postsoitem.qtytofulfill) as total
        FROM postso 
        JOIN customer ON customer.id = postso.customerid
        JOIN postsoitem ON postsoitem.postsoid = postso.id
        GROUP BY customer.name
        ORDER BY total DESC
    </script>

    <!-- Common JavaScript -->
    <script src="js/jquery.min.js"></script>
    <script src="js/utils/fishbowl.js"></script>
    
    <!-- Page-specific JavaScript -->
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('runReport').addEventListener('click', function() {
                const sql = document.getElementById('mainQuery').textContent.trim();
                const results = fb_query(sql);
                displayResults(results);
            });
            
            function displayResults(data) {
                const container = document.getElementById('results');
                // Build table HTML
                let html = '<table class="table"><thead><tr><th>Customer</th><th>Total</th></tr></thead><tbody>';
                data.forEach(row => {
                    html += `<tr><td>${row.name}</td><td>$${row.total.toLocaleString()}</td></tr>`;
                });
                html += '</tbody></table>';
                container.innerHTML = html;
            }
        });
    </script>
</body>
</html>
```

### Multi-File Approach (Complex Reports)

For complex reports, resources are organized in page-specific folders:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="fb_title" content="Complex Report">
    <meta name="fb_path" content="Reports:Category">
    <title>Complex Report</title>
    
    <!-- Common CSS -->
    <link rel="stylesheet" href="css/bootstrap.min.css">
    <link rel="stylesheet" href="css/dashboard.css">
    
    <!-- Page-specific CSS -->
    <link rel="stylesheet" href="ComplexReport/css/styles.css">
    
    <!-- Common JavaScript -->
    <script src="js/jquery.min.js"></script>
    <script src="js/utils/fishbowl.js"></script>
    
    <!-- Page-specific JavaScript -->
    <script src="ComplexReport/js/app.js" defer></script>
</head>
<body>
    <div class="container-fluid">
        <!-- Page content -->
    </div>
</body>
</html>
```

### Standard HTML Template
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Fishbowl-specific meta tags -->
    <meta name="fb_title" content="Page Title">
    <meta name="fb_path" content="Reports:Category">
    <meta name="fb_modules" content="Sales Order,Customer">
    <meta name="fb_description" content="Page Description">
    
    <!-- CSS Dependencies -->
    <link rel="stylesheet" href="css/bootstrap.min.css">
    <link rel="stylesheet" href="css/dashboard.css">
    <link rel="stylesheet" href="css/page-specific.css">
    
    <!-- JavaScript Dependencies -->
    <script src="js/jquery.min.js"></script>
    <script src="js/bootstrap.bundle.min.js"></script>
    <script src="js/utils/fishbowl.js"></script>
    <script src="js/ModuleName/app.js" defer></script>
</head>
<body>
    <!-- Page content with Bootstrap classes -->
    <div class="container-fluid">
        <!-- Collapsible header pattern -->
        <h2 class="display-6 d-flex justify-content-between align-items-center" 
            data-bs-toggle="collapse" data-bs-target="#collapseReport">
            <span class="title">Report Title</span>
            <span class="version">v2023.07.21</span>
        </h2>
        
        <!-- Collapsible controls section -->
        <div class="collapse show" id="collapseReport">
            <div class="card card-body">
                <!-- Form controls and filters -->
            </div>
        </div>
        
        <!-- Results section -->
        <div id="resultsContainer">
            <!-- Dynamic content populated by JavaScript -->
        </div>
    </div>
    
    <!-- Embedded SQL queries -->
    <script id="mainQuery" type="text/plain">
        <!-- SQL content -->
    </script>
</body>
</html>
```

### Key HTML Patterns

1. **Fishbowl Meta Tags**: Special meta tags for Fishbowl integration
2. **Bootstrap Framework**: Consistent use of Bootstrap for responsive design
3. **Collapsible UI**: Consistent collapsible header pattern
4. **Embedded SQL**: SQL queries stored in script tags with type="text/plain"
5. **Deferred Loading**: Scripts loaded with defer attribute for performance

## 3. JavaScript Architecture and Patterns

### Core Architecture Overview

The JavaScript architecture follows a modular pattern with clear separation of concerns:

- **Module-based organization**: Each feature has its own directory
- **Utility-first approach**: Common functions centralized in utils/
- **Event-driven**: Heavy use of DOM events and callbacks
- **Progressive enhancement**: Starts with basic HTML, enhanced with JavaScript

### Fishbowl Bridge Integration

The `fb_client` object serves as the primary interface between JavaScript and Fishbowl. For complete documentation of all available methods and parameters, see [PluginBrowserBridge_Documentation.md](PluginBrowserBridge_Documentation.md).

```javascript
// Core database query wrapper utility
function fb_query(sql, params) {
    if (sql && params) {
        var param_json = JSON.stringify(params);
        return JSON.parse(fb_client.runQueryParameters(sql, param_json));
    } else if (sql) {
        return JSON.parse(fb_client.runQuery(sql));
    }
    return {};
}
```

**Key Bridge Methods Used in Report Architecture:**
- `fb_client.runQuery(sql)` - Execute SQL queries  
- `fb_client.runQueryParameters(sql, params)` - Execute parameterized queries
- `fb_client.getResourceFileString(path)` - Load external SQL/template files
- `fb_client.dialogStatus(message)` - Update UI status messages
- `fb_client.pbUpdate(value)` - Update progress indicators
- `fb_client.hyperLink(module, id)` - Navigate to Fishbowl records
- `fb_client.printZPL(printer, zpl_data)` - Print labels and documents

> **Note**: The bridge provides many additional methods for reporting, file operations, user management, and printing. Refer to the bridge documentation for complete method signatures and usage examples.

### Common JavaScript Patterns

#### Application Entry Point Pattern
```javascript
document.addEventListener("DOMContentLoaded", () => {
    // Initialize application
    initializeControls();
    loadInitialData();
    setupEventHandlers();
});
```

#### Data Processing Pattern
```javascript
function processData(rawData) {
    return rawData.map(row => ({
        ...row,
        customFields: JSON.parse(row.customFields || '{}'),
        calculatedField: calculateValue(row)
    }));
}
```

#### Error Handling Pattern
```javascript
function executeOperation() {
    try {
        fb_client.pbUpdate(-1);
        fb_client.dialogStatus("Processing...");
        
        const result = fb_query(sql, params);
        
        // Check for SQL errors
        if (result.is_error) {
            fb_client.logError("Query failed: " + result.error_msg);
            return;
        }
        
        processResult(result);
        
    } catch (error) {
        fb_client.logError("Operation failed: " + error.message);
        fb_client.dialogStatus("Error: " + error.message);
    } finally {
        fb_client.pbUpdate(0);
    }
}
```

> **Note**: For comprehensive error handling patterns and best practices, see [PluginBrowserBridge_Documentation.md](PluginBrowserBridge_Documentation.md#error-handling-best-practices).

### Utility Functions

#### String Utilities
```javascript
function isEmpty(str) {
    return !str || str.length === 0;
}

function StringBuilder(value) {
    this.strings = new Array();
    this.append = function(value) {
        if (value) this.strings.push(value);
    };
    this.toString = function() {
        return this.strings.join("");
    };
}
```

#### Date Utilities
```javascript
function getCurrentStartEndMonth() {
    var current_date = new Date();
    var y = current_date.getFullYear();
    var m = current_date.getMonth();
    return {
        start: new Date(y, m, 1).toISOString().slice(0, 10),
        end: new Date(y, m, 30).toISOString().slice(0, 10)
    };
}
```

#### Math Utilities
```javascript
function divideIfNotZero(numerator, denominator) {
    if (denominator === 0 || isNaN(denominator)) return 0;
    if (numerator === 0 || isNaN(numerator)) return 0;
    return numerator / denominator;
}
```

### State Management

#### Global State Pattern
```javascript
// Global variables for application state
var table_data = [];
var current_filters = {};
var ui_state = {
    expanded: false,
    loading: false
};
```

#### Configuration Objects
```javascript
var gridConfig = {
    columns: [
        { field: "id", title: "ID", width: 100 },
        { field: "name", title: "Name", width: 200 }
    ],
    dataSource: {
        data: table_data,
        pageSize: 50
    }
};
```

## 4. SQL Query Patterns and Data Access

### SQL Query Organization

#### Page-Specific SQL Files (Complex Reports)
```
PageName/
├── sql/
│   ├── main_query.sql           # Primary data retrieval
│   ├── lookup_query.sql         # Reference data
│   └── detail_query.sql         # Drill-down queries
```

#### Embedded SQL Queries (Simple Reports)
For simple reports, SQL queries are embedded directly in the HTML:

```html
<!-- Main data query -->
<script id="mainQuery" type="text/plain">
    SELECT 
        customer.name,
        SUM(postsoitem.unitprice * postsoitem.qtytofulfill) as total
    FROM postso 
    JOIN customer ON customer.id = postso.customerid
    JOIN postsoitem ON postsoitem.postsoid = postso.id
    GROUP BY customer.name
    ORDER BY total DESC
</script>

<!-- Lookup query for dropdowns -->
<script id="customerLookup" type="text/plain">
    SELECT id, name FROM customer 
    WHERE active = 1 
    ORDER BY name
</script>

<!-- JavaScript access -->
<script>
    function getQuerySQL(queryId) {
        const element = document.getElementById(queryId);
        return element ? element.textContent.trim() : '';
    }
    
    // Usage
    const mainSQL = getQuerySQL('mainQuery');
    const lookupSQL = getQuerySQL('customerLookup');
</script>
```

### Query Template System

#### Template Placeholders
- `#placeholder#` - Dynamic content injection
- `@placeholder@` - Template replacement
- `:parameter` - Parameter binding

#### Example Query Template
```sql
-- sql/CustomerSales/sales_data.sql
SELECT 
    customer.name,
    SUM(postsoitem.qtytofulfill * postsoitem.unitprice) as total_sales
FROM postso
JOIN customer ON customer.id = postso.customerid
JOIN postsoitem ON postsoitem.postsoid = postso.id
WHERE 1=1
    #date_filter#
    #customer_filter#
    #product_filter#
GROUP BY customer.name
ORDER BY total_sales DESC
```

#### Dynamic Query Building
```javascript
function buildQuery(baseQuery, filters) {
    var query = baseQuery;
    
    // Date filter
    if (filters.startDate && filters.endDate) {
        var dateFilter = `AND DATE(postso.postdate) BETWEEN '${filters.startDate}' AND '${filters.endDate}'`;
        query = query.replace('#date_filter#', dateFilter);
    } else {
        query = query.replace('#date_filter#', '');
    }
    
    // Customer filter
    if (filters.customerId) {
        query = query.replace('#customer_filter#', `AND customer.id = ${filters.customerId}`);
    } else {
        query = query.replace('#customer_filter#', '');
    }
    
    return query;
}
```

### Parameter Binding

#### Secure Parameter Binding
```javascript
function executeParameterizedQuery(sql, params) {
    return fb_query(sql, params);
}

// Usage
const result = executeParameterizedQuery(
    "SELECT * FROM customer WHERE id = :customer_id AND active = :active",
    { customer_id: 123, active: true }
);
```

### Common Database Patterns

#### Sales Order Data Flow
```sql
-- Core sales order structure
postso (Posted Sales Orders)
├── customer (Customer information)
├── sysuser (Sales representative)
├── postsoitem (Line items)
│   ├── product (Product details)
│   │   └── part (Part information)
│   └── unitprice, qtytofulfill
└── trackinginfo (Lot/serial tracking)
```

#### Custom Fields Architecture
```sql
-- Custom fields stored as JSON
SELECT 
    product.name,
    product.customFields,
    CustomFieldByName(product.customFields, 'Field Name') as field_value
FROM product
WHERE CustomFieldByName(product.customFields, 'Active') = 'true'
```

## 5. CSS and Styling Approach

### Styling Architecture

1. **Bootstrap Foundation**: Uses Bootstrap 5 as the base framework
2. **Component-Specific Styles**: Each page has its own CSS file
3. **Utility Classes**: Custom utility classes for common patterns
4. **Responsive Design**: Mobile-first responsive approach

### Common CSS Patterns

#### Collapsible Header Pattern
```css
h2[aria-expanded="true"] .bi-caret-up {
    display: none;
}

h2[aria-expanded="false"] .bi-caret-down {
    display: none;
}

h2 {
    cursor: pointer;
}

h2 span.title {
    font-size: 40px;
}

h2 span.version {
    font-size: 15px;
}
```

#### Table Styling
```css
.table-container {
    width: 95%;
    margin: 0 auto;
    overflow-x: auto;
    border: 1px solid #ddd;
}

table {
    width: 100%;
    border-collapse: collapse;
    background-color: white;
}

th {
    background-color: #f5f5f5;
    color: #000;
    font-weight: bold;
    padding: 10px;
    text-align: left;
    border: 1px solid #ddd;
}
```

#### Button Styling
```css
.btn-primary {
    background-color: #007bff;
    border-color: #007bff;
    padding: 8px 16px;
    font-size: 14px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-primary:hover {
    background-color: #0056b3;
    border-color: #0056b3;
}
```

### Responsive Design Patterns

#### Grid Layout
```css
.actions-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    width: 95%;
    margin: 20px auto 15px auto;
}
```

#### Flexbox for Controls
```css
.bulk-actions {
    display: flex;
    justify-content: left;
    gap: 10px;
    flex-wrap: wrap;
}
```

## 6. Integration Patterns

### Fishbowl Meta Tag Configuration
```html
<meta name="fb_title" content="Report Title">
<meta name="fb_path" content="Reports:Category">
<meta name="fb_modules" content="Sales Order,Customer">
<meta name="fb_description" content="Report Description">
```

### Common Integration Patterns
```javascript
// Basic status and progress updates
fb_client.dialogStatus("Processing data...");
fb_client.pbUpdate(50);

// Navigation to Fishbowl records
fb_client.hyperLink("Customer", customerId);

// ZPL label printing with templates
const zplTemplate = document.getElementById("zpl_label").textContent;
let labelZPL = zplTemplate.replace("#ORDER_NUM#", order.number);
fb_client.printZPL("LABEL_PRINTER", labelZPL);
```

> **Note**: For comprehensive integration patterns including data export, reporting, file operations, and printing, see [PluginBrowserBridge_Documentation.md](PluginBrowserBridge_Documentation.md#common-usage-patterns).

## 7. Best Practices and Recommendations

### Development Best Practices

1. **Modular Architecture**: Keep features separated and self-contained
2. **Resource Management**: Store SQL queries and templates externally
3. **Error Handling**: Implement comprehensive error handling
4. **Performance**: Use efficient data processing and caching
5. **Security**: Always use parameterized queries
6. **Testing**: Test with realistic data volumes

### Code Organization

1. **Consistent Naming**: Use consistent naming conventions
2. **Documentation**: Document complex business logic
3. **Version Control**: Track changes to SQL queries and configurations
4. **Configuration**: Use configuration objects for UI components
5. **Utilities**: Create reusable utility functions

### Performance Optimization

1. **Lazy Loading**: Load data only when needed
2. **Pagination**: Implement pagination for large datasets
3. **Caching**: Cache frequently accessed data
4. **Efficient Queries**: Optimize SQL queries with proper indexing
5. **DOM Manipulation**: Minimize DOM updates

## 8. Refactoring and Migration Patterns

### From Single-Page to Multi-File Architecture

When a single-page report grows beyond 1000 lines or becomes complex, follow this refactoring pattern:

#### Step 1: Create Page-Specific Folder
```bash
mkdir PageName/
mkdir PageName/css/
mkdir PageName/js/
mkdir PageName/sql/
```

#### Step 2: Extract CSS
Move `<style>` content to `PageName/css/styles.css`:
```css
/* PageName/css/styles.css */
.report-container {
    margin: 20px auto;
    max-width: 1200px;
}
.results-table {
    margin-top: 20px;
}
```

#### Step 3: Extract SQL
Move `<script type="text/plain">` content to SQL files:
```sql
-- PageName/sql/main_query.sql
SELECT 
    customer.name,
    SUM(postsoitem.unitprice * postsoitem.qtytofulfill) as total
FROM postso 
JOIN customer ON customer.id = postso.customerid
JOIN postsoitem ON postsoitem.postsoid = postso.id
GROUP BY customer.name
ORDER BY total DESC
```

#### Step 4: Extract JavaScript
Move `<script>` content to `PageName/js/app.js`:
```javascript
// PageName/js/app.js
document.addEventListener('DOMContentLoaded', function() {
    initializeReport();
});

function initializeReport() {
    document.getElementById('runReport').addEventListener('click', runReport);
}

function runReport() {
    // Load SQL from external file
    const sql = fb_client.getResourceFileString('PageName/sql/main_query.sql');
    const results = fb_query(sql);
    displayResults(results);
}
```

#### Step 5: Update HTML References
```html
<!-- Replace embedded styles -->
<link rel="stylesheet" href="PageName/css/styles.css">

<!-- Replace embedded scripts -->
<script src="PageName/js/app.js" defer></script>

<!-- Remove embedded SQL and JavaScript -->
```

### Decision Matrix for Architecture Choice

| Criteria | Single-Page | Multi-File |
|----------|-------------|------------|
| Total Lines | < 1000 | > 1000 |
| SQL Queries | 1-3 simple | > 3 or complex |
| JavaScript Functions | < 10 | > 10 |
| CSS Rules | < 50 | > 50 |
| Team Size | 1 developer | Multiple developers |
| Reusability | Page-specific | Cross-page components |
| Maintenance | Simple changes | Complex features |

## 9. Migration and Adaptation Guidelines

### For New Projects

1. **Database Bridge**: Create equivalent of `fb_client` for your database
2. **SQL Management**: Implement external SQL file loading system
3. **Template System**: Build query template replacement system
4. **Utility Library**: Recreate essential utility functions
5. **UI Framework**: Use Bootstrap or similar responsive framework

### Framework Alternatives

#### Commercial Library Replacements
- **Kendo UI Grid** → AG-Grid, DataTables, or Tabulator
- **Flexmonster Pivot** → PivotTable.js or WebDataRocks
- **Kendo Charts** → Chart.js or D3.js
- **Kendo DatePicker** → Flatpickr or native HTML5 inputs

#### Open Source Alternatives
```javascript
// Instead of Kendo Grid
$('#grid').DataTable({
    data: tableData,
    columns: [
        { title: "ID", data: "id" },
        { title: "Name", data: "name" }
    ],
    pageLength: 50,
    responsive: true
});

// Instead of Kendo DatePicker
flatpickr("#dateRange", {
    mode: "range",
    dateFormat: "Y-m-d"
});
```

## 9. Security and Best Practices

### Architecture-Specific Security
- **SQL Template Validation**: Validate template replacements to prevent injection
- **Resource Path Validation**: Ensure SQL file paths are within allowed directories
- **Page-Level Access Control**: Use `fb_client.hasAccessRight()` for page access
- **Input Sanitization**: Sanitize all user inputs before template replacement

> **Note**: For comprehensive security guidelines including SQL injection prevention, access control, and error handling, see [PluginBrowserBridge_Documentation.md](PluginBrowserBridge_Documentation.md#security-considerations).

## Conclusion

This architecture provides a solid foundation for building rich, database-driven web applications with excellent performance, maintainability, and user experience. The key architectural principles are:

### Core Benefits
- **Progressive Complexity**: Start simple with single-page approach, scale to multi-file as needed
- **Page-Specific Organization**: Clean separation of resources by page/feature
- **Reusable Patterns**: Consistent approaches across all report types
- **Clear Migration Path**: Well-defined process for growing from simple to complex

### Success Factors
- **Proper Organization**: Use page-specific folders for complex reports
- **Template-Based SQL**: Maintain SQL queries as external resources
- **Utility-First JavaScript**: Centralize common functionality
- **Bridge Integration**: Leverage the full power of the Fishbowl bridge

### Development Workflow
1. **Start Simple**: Begin with single-page approach for basic reports
2. **Monitor Complexity**: Track lines of code and feature complexity
3. **Refactor When Needed**: Migrate to page-specific folders at 1000+ lines
4. **Maintain Standards**: Follow consistent patterns across all pages

The combination of this architectural approach with the comprehensive Fishbowl bridge provides a powerful platform for building sophisticated business applications that integrate seamlessly with the Fishbowl ecosystem.