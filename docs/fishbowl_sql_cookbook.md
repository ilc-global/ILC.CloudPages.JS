# Fishbowl SQL Cookbook
*A Practical Guide to Common Query Patterns and Approaches*

## Table of Contents
1. [Sales Order Query Patterns](#sales-order-query-patterns)
2. [Customer and Address Resolution](#customer-and-address-resolution)
3. [Inventory and Product Queries](#inventory-and-product-queries)
4. [Financial Calculations](#financial-calculations)
5. [Parameter Binding Techniques](#parameter-binding-techniques)
6. [Data Quality and Missing Value Handling](#data-quality-and-missing-value-handling)
7. [Date and Time Filtering](#date-and-time-filtering)
8. [Complex Business Logic](#complex-business-logic)
9. [Performance Optimization Patterns](#performance-optimization-patterns)
10. [Custom Field Integration](#custom-field-integration)

---

## Sales Order Query Patterns

### Basic Sales Order with Items
**When to use**: Foundation for most sales-related reports
```sql
-- Basic sales order structure
SELECT 
    so.num AS order_number,
    so.customerpo AS customer_po,
    customer.name AS customer_name,
    soitem.productnum,
    soitem.description,
    soitem.qtytofulfill,
    soitem.unitprice,
    soitem.qtytofulfill * soitem.unitprice AS ext_price
FROM so
    INNER JOIN soitem ON so.id = soitem.soid
    INNER JOIN customer ON customer.id = so.customerid
WHERE so.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
ORDER BY so.num, soitem.solineitem
```

### Sales Order with Posted Transactions
**When to use**: Reports that need actual shipped/invoiced data
```sql
-- Include posted (completed) transaction data
SELECT 
    so.num AS sonum,
    postsoitem.datecreated AS date_shipped,
    customer.name AS customer_name,
    soitem.productnum,
    -- Handle returns with negative quantities
    CASE WHEN soitem.typeid = 20 
         THEN postsoitem.qty * -1
         ELSE postsoitem.qty
    END AS qty_shipped,
    postsoitem.postedtotalcost AS cogs,
    soitem.unitprice,
    (soitem.unitprice * postsoitem.qty) AS ext_price
FROM soitem
    INNER JOIN postsoitem ON soitem.id = postsoitem.soitemid
    INNER JOIN so ON so.id = soitem.soid
    INNER JOIN customer ON customer.id = so.customerid
WHERE postsoitem.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
ORDER BY postsoitem.datecreated, so.num
```

### Commission Report Pattern
**When to use**: Sales analysis with profitability metrics
```sql
-- Commission calculation with margins
SELECT 
    so.salesmaninitials,
    so.num AS sonum,
    postsoitem.datecreated AS date_shipped,
    customer.name AS customer_name,
    soitem.productnum,
    CASE WHEN soitem.typeid = 20
         THEN postsoitem.qty * -1
         ELSE postsoitem.qty
    END AS qty_shipped,
    postsoitem.postedtotalcost AS cogs,
    soitem.unitprice,
    (soitem.unitprice * postsoitem.qty) AS ext_price,
    -- Margin calculation
    ((soitem.unitprice * postsoitem.qty) - postsoitem.postedtotalcost) AS margins
FROM soitem
    INNER JOIN postsoitem ON soitem.id = postsoitem.soitemid
    INNER JOIN so ON so.id = soitem.soid
    INNER JOIN customer ON customer.id = so.customerid
WHERE postsoitem.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
    AND UPPER(so.salesman) LIKE UPPER($P{salesPerson})
ORDER BY so.salesmaninitials, customer.name
```

---

## Customer and Address Resolution

### Basic Customer with Primary Address
**When to use**: Simple customer reports
```sql
-- Customer with main address information
SELECT 
    customer.name AS customer_name,
    address.name AS address_name,
    address.address,
    address.city,
    address.zip,
    stateconst.name AS state,
    countryconst.name AS country
FROM customer
    INNER JOIN address ON customer.accountid = address.accountid
    INNER JOIN addresstype ON address.typeid = addresstype.id
    LEFT JOIN stateconst ON address.stateid = stateconst.id
    LEFT JOIN countryconst ON address.countryid = countryconst.id
WHERE addresstype.name = 'Main Office'
ORDER BY customer.name
```

### Advanced Address Resolution (Bill To vs Ship To)
**When to use**: Invoicing and shipping reports that need flexible address handling
```sql
-- Complex address resolution with fallback logic
SELECT 
    customer.name AS customer_name,
    -- Bill To address with Main Office fallback
    CASE WHEN (SELECT address.address 
               FROM address 
               LEFT JOIN addresstype ON address.typeid = addresstype.id 
               WHERE customer.accountid = address.accountid 
               AND addresstype.name = 'Bill To' 
               LIMIT 1) IS NOT NULL
         THEN (SELECT address.address 
               FROM address 
               LEFT JOIN addresstype ON address.typeid = addresstype.id 
               WHERE customer.accountid = address.accountid 
               AND addresstype.name = 'Bill To' 
               LIMIT 1)
         ELSE (SELECT address.address 
               FROM address 
               LEFT JOIN addresstype ON address.typeid = addresstype.id 
               WHERE customer.accountid = address.accountid 
               AND addresstype.name = 'Main Office' 
               LIMIT 1)
    END AS bill_to_address,
    
    -- Ship To is always Main Office
    (SELECT address.address 
     FROM address 
     LEFT JOIN addresstype ON address.typeid = addresstype.id 
     WHERE customer.accountid = address.accountid 
     AND addresstype.name = 'Main Office' 
     LIMIT 1) AS ship_to_address
FROM customer
WHERE customer.id = $P{customerID}
```

### Customer Contact Information
**When to use**: Reports needing phone, email, and contact details
```sql
-- Customer with contact information
SELECT 
    customer.name AS customer_name,
    contact.contactname,
    contact.datus AS contact_data,
    contacttype.name AS contact_type,
    -- Phone number extraction
    (SELECT contact.datus 
     FROM contact 
     WHERE contact.accountid = customer.accountid 
     AND contact.typeid = 50 
     LIMIT 1) AS phone,
    -- Email extraction  
    (SELECT contact.datus 
     FROM contact 
     WHERE contact.accountid = customer.accountid 
     AND contact.typeid = 20 
     LIMIT 1) AS email
FROM customer
    LEFT JOIN contact ON customer.accountid = contact.accountid
    LEFT JOIN contacttype ON contact.typeid = contacttype.id
WHERE customer.id LIKE $P{customerID}
ORDER BY customer.name, contacttype.name
```

---

## Inventory and Product Queries

### Current Inventory Status
**When to use**: Stock level reports and reorder analysis
```sql
-- Comprehensive inventory status
SELECT 
    part.num AS part_number,
    part.description,
    locationgroup.name AS location,
    COALESCE(qtyonhand.qty, 0) AS on_hand,
    COALESCE(qtyallocated.qty, 0) AS allocated,
    COALESCE(qtyonorder.qty, 0) AS on_order,
    COALESCE(qtynotavailable.qty, 0) AS not_available,
    -- Available quantity calculation
    (COALESCE(qtyonhand.qty, 0) - COALESCE(qtyallocated.qty, 0)) AS available,
    COALESCE(partreorder.reorderpoint, 0) AS reorder_point,
    COALESCE(partreorder.orderuptolevel, 0) AS order_up_to_level
FROM part
    LEFT JOIN partreorder ON part.id = partreorder.partid
    LEFT JOIN locationgroup ON locationgroup.id = partreorder.locationgroupid
    LEFT JOIN qtyonhand ON (part.id = qtyonhand.partid 
                           AND locationgroup.id = qtyonhand.locationgroupid)
    LEFT JOIN qtyallocated ON (part.id = qtyallocated.partid 
                              AND locationgroup.id = qtyallocated.locationgroupid)
    LEFT JOIN qtyonorder ON (part.id = qtyonorder.partid 
                            AND locationgroup.id = qtyonorder.locationgroupid)
    LEFT JOIN qtynotavailable ON (part.id = qtynotavailable.partid 
                                  AND locationgroup.id = qtynotavailable.locationgroupid)
WHERE part.activeflag = 1
    AND part.num LIKE $P{partNum}
ORDER BY part.num, locationgroup.name
```

### Product with Tree Categorization
**When to use**: Product reports that need category hierarchy
```sql
-- Product with category tree information
SELECT 
    product.num AS product_number,
    product.description,
    part.num AS part_number,
    producttree.name AS category,
    -- Custom field for product type
    TRIM(COALESCE(customset.info, producttree.name, 'Undefined')) AS product_type,
    vendor.name AS default_vendor
FROM product
    INNER JOIN part ON product.partid = part.id
    LEFT JOIN producttotree ON product.id = producttotree.productid
    LEFT JOIN producttree ON producttotree.producttreeid = producttree.id
    LEFT JOIN customset ON (customset.customfieldid = 61 
                           AND customset.recordid = product.id)
    LEFT JOIN vendorparts ON (vendorparts.partid = part.id 
                             AND vendorparts.defaultflag = 1)
    LEFT JOIN vendor ON vendor.id = vendorparts.vendorid
WHERE product.activeflag = 1
ORDER BY producttree.name, product.num
```

### Reorder Report Pattern
**When to use**: Purchasing and inventory management
```sql
-- Parts that need reordering
SELECT 
    part.num AS part_number,
    part.description,
    locationgroup.name AS location,
    COALESCE(partreorder.reorderpoint, 0) AS reorder_point,
    COALESCE(partreorder.orderuptolevel, 0) AS order_up_to,
    COALESCE(qtyonhand.qty, 0) AS current_qty,
    COALESCE(qtyallocated.qty, 0) AS allocated_qty,
    (COALESCE(qtyonhand.qty, 0) - COALESCE(qtyallocated.qty, 0)) AS available_qty,
    vendor.name AS preferred_vendor,
    -- Reorder needed calculation
    CASE WHEN (COALESCE(qtyonhand.qty, 0) - COALESCE(qtyallocated.qty, 0)) 
              <= COALESCE(partreorder.reorderpoint, 0)
         THEN 'YES'
         ELSE 'NO'
    END AS reorder_needed,
    -- Suggested order quantity
    CASE WHEN (COALESCE(qtyonhand.qty, 0) - COALESCE(qtyallocated.qty, 0)) 
              <= COALESCE(partreorder.reorderpoint, 0)
         THEN COALESCE(partreorder.orderuptolevel, 0) - 
              (COALESCE(qtyonhand.qty, 0) - COALESCE(qtyallocated.qty, 0))
         ELSE 0
    END AS suggested_order_qty
FROM part
    LEFT JOIN partreorder ON part.id = partreorder.partid
    LEFT JOIN locationgroup ON locationgroup.id = partreorder.locationgroupid
    LEFT JOIN qtyonhand ON (part.id = qtyonhand.partid 
                           AND locationgroup.id = qtyonhand.locationgroupid)
    LEFT JOIN qtyallocated ON (part.id = qtyallocated.partid 
                              AND locationgroup.id = qtyallocated.locationgroupid)
    LEFT JOIN vendorparts ON (vendorparts.partid = part.id 
                             AND vendorparts.defaultflag = 1)
    LEFT JOIN vendor ON vendor.id = vendorparts.vendorid
WHERE part.activeflag = 1
    AND (COALESCE(qtyonhand.qty, 0) - COALESCE(qtyallocated.qty, 0)) 
        <= COALESCE(partreorder.reorderpoint, 0)
ORDER BY part.num
```

---

## Financial Calculations

### Standard Margin Calculation
**When to use**: Profitability analysis and commission reports
```sql
-- Margin and profit calculations
SELECT 
    soitem.productnum,
    postsoitem.qty AS qty_sold,
    soitem.unitprice AS sell_price,
    postsoitem.postedtotalcost AS cost_price,
    -- Extended price
    (soitem.unitprice * postsoitem.qty) AS extended_price,
    -- Gross margin dollars
    ((soitem.unitprice * postsoitem.qty) - postsoitem.postedtotalcost) AS margin_dollars,
    -- Gross margin percentage
    CASE WHEN (soitem.unitprice * postsoitem.qty) > 0
         THEN (((soitem.unitprice * postsoitem.qty) - postsoitem.postedtotalcost) 
               / (soitem.unitprice * postsoitem.qty)) * 100
         ELSE 0
    END AS margin_percent
FROM soitem
    INNER JOIN postsoitem ON soitem.id = postsoitem.soitemid
WHERE postsoitem.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
```

### Multi-Currency Handling
**When to use**: International sales and reporting
```sql
-- Multi-currency calculations
SELECT 
    so.num AS order_number,
    currency.code AS transaction_currency,
    currency.symbol AS currency_symbol,
    so.currencyrate AS exchange_rate,
    soitem.totalprice AS local_amount,
    -- Convert to home currency
    (soitem.totalprice / so.currencyrate) AS home_currency_amount,
    -- Tax calculations in both currencies
    (CASE soitem.taxableflag 
     WHEN 1 THEN soitem.totalprice * COALESCE(so.taxrate, 0)
     ELSE 0 
     END) AS local_tax,
    (CASE soitem.taxableflag 
     WHEN 1 THEN (soitem.totalprice * COALESCE(so.taxrate, 0)) / so.currencyrate
     ELSE 0 
     END) AS home_currency_tax,
    homecurrency.code AS home_currency_code,
    homecurrency.symbol AS home_currency_symbol
FROM so
    INNER JOIN soitem ON so.id = soitem.soid
    INNER JOIN customer ON so.customerid = customer.id
    LEFT JOIN currency ON customer.currencyid = currency.id
    LEFT JOIN currency AS homecurrency ON homecurrency.homecurrency = 1
WHERE so.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
```

### Discount and Adjustment Handling
**When to use**: Detailed pricing analysis with discounts
```sql
-- Price adjustments and discounts
SELECT 
    soitem.productnum,
    soitem.unitprice AS list_price,
    COALESCE(itemadjust.percentage, 0) AS discount_percent,
    -- Net price after discount
    (soitem.unitprice * (1 - COALESCE(itemadjust.percentage, 0))) AS net_price,
    postsoitem.qty AS quantity,
    -- Extended net price
    ((soitem.unitprice * postsoitem.qty) * 
     (1 - COALESCE(itemadjust.percentage, 0))) AS product_net_price
FROM soitem
    INNER JOIN postsoitem ON soitem.id = postsoitem.soitemid
    INNER JOIN so ON so.id = soitem.soid
    -- Complex discount lookup logic
    LEFT JOIN (
        SELECT so.id AS soid, 
               soitem.id AS soitemid, 
               MIN(sst.solineitem) AS sstid 
        FROM so
            JOIN soitem ON soitem.soid = so.id
            JOIN soitem AS sst ON (sst.soid = so.id 
                                  AND sst.solineitem > soitem.solineitem 
                                  AND sst.typeid = 40)
        GROUP BY so.id, soitem.id
    ) AS csst ON (csst.soid = so.id AND csst.soitemid = soitem.id)
    LEFT JOIN soitem AS discount ON (discount.soid = so.id 
                                    AND discount.typeid = 30 
                                    AND ((csst.sstid + 1 = discount.solineitem) 
                                        OR (discount.solineitem = soitem.solineitem + 1)))
    LEFT JOIN itemadjust ON itemadjust.id = discount.itemadjustid
WHERE postsoitem.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
```

---

## CloudPages Parameter Binding with fb_client

### Using fb_client.runQueryParameters()
**When to use**: For secure parameter binding in CloudPages
```sql
-- CloudPages parameter binding uses :parameter syntax
SELECT 
    so.num AS order_number,
    customer.name AS customer_name,
    soitem.productnum,
    soitem.qtytofulfill * soitem.unitprice AS ext_price
FROM so
    INNER JOIN soitem ON so.id = soitem.soid
    INNER JOIN customer ON customer.id = so.customerid
WHERE so.datecreated BETWEEN :start_date AND :end_date
    AND customer.id = :customer_id
    AND so.statusid IN (:status_list)
ORDER BY so.num
```

### JavaScript Parameter Usage
```javascript
// Example of proper parameter binding in CloudPages
const sql = `
    SELECT * FROM so 
    WHERE datecreated BETWEEN :start_date AND :end_date 
    AND customerid = :customer_id
`;

const params = {
    start_date: "2023-01-01",
    end_date: "2023-12-31", 
    customer_id: 123
};

const results = fb_query(sql, params);
```

### Dynamic Query Building for CloudPages
**When to use**: When you need conditional SQL logic
```javascript
// Build dynamic queries in JavaScript instead of SQL
function buildCustomerQuery(filters) {
    let sql = `
        SELECT customer.name, customer.id 
        FROM customer 
        WHERE customer.activeflag = 1
    `;
    
    let params = {};
    
    if (filters.customerId) {
        sql += " AND customer.id = :customer_id";
        params.customer_id = filters.customerId;
    }
    
    if (filters.customerName) {
        sql += " AND UPPER(customer.name) LIKE UPPER(:customer_name)";
        params.customer_name = `%${filters.customerName}%`;
    }
    
    return fb_query(sql, params);
}
```

---

## Data Quality and Missing Value Handling

### COALESCE Patterns
**When to use**: Handling null values and providing defaults
```sql
-- Basic null handling
SELECT 
    COALESCE(customer.name, 'Unknown Customer') AS customer_name,
    COALESCE(customerstatus.name, '') AS status,
    COALESCE(countryconst.abbreviation, '') AS country_abbr,
    COALESCE(stateconst.code, '') AS state_abbr

-- Numeric defaults
SELECT 
    COALESCE(qtyonhand.qty, 0) AS on_hand_qty,
    COALESCE(partreorder.reorderpoint, 0) AS reorder_point,
    COALESCE(so.taxrate, 0) AS tax_rate
```

### Complex Default Logic
**When to use**: Multi-level fallback scenarios
```sql
-- Product type with multiple fallbacks
SELECT 
    TRIM(COALESCE(customset.info, producttree.name, 'Undefined')) AS product_type,
    -- Custom field with function fallback
    TRIM(COALESCE(customfieldbyid(product.customfields, 61), 
                  producttree.name, 
                  'Undefined')) AS product_category
```

### String Cleaning and Formatting
**When to use**: Data presentation and standardization
```sql
-- Trim and clean text data
SELECT 
    TRIM(COALESCE(customset.info, 'Undefined')) AS clean_product_type,
    UPPER(TRIM(customer.name)) AS standardized_customer_name

-- String concatenation with null handling
SELECT 
    CONCAT(COALESCE(address.address, ''), 
           CASE WHEN address.address IS NOT NULL THEN ', ' ELSE '' END,
           COALESCE(address.city, ''),
           CASE WHEN address.city IS NOT NULL THEN ', ' ELSE '' END,
           COALESCE(stateconst.code, ''),
           CASE WHEN address.zip IS NOT NULL THEN ' ' ELSE '' END,
           COALESCE(address.zip, '')) AS full_address
```

---

## Date and Time Filtering

### Standard Date Range Queries
**When to use**: Most time-based reports
```sql
-- Posted transaction dates
WHERE postsoitem.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}

-- Order creation dates
WHERE so.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}

-- Ship dates
WHERE ship.dateshipped BETWEEN $P{dateRange1} AND $P{dateRange2}
```

### Complex Date Logic
**When to use**: Reports with multiple date scenarios
```sql
-- Conditional date selection
SELECT 
    CASE WHEN so.datecompleted IS NOT NULL THEN CAST(so.datecompleted AS DATE)
         WHEN pick.datefinished IS NOT NULL THEN CAST(pick.datefinished AS DATE)
         ELSE CAST(so.datecalstart AS DATE)
    END AS effective_ship_date

-- Date calculations
WHERE ship.dateshipped BETWEEN $P{dateRange1} 
                           AND DATE_SUB($P{dateRange2}, INTERVAL 1 SECOND)
```

### Date Field Selection
**When to use**: Reports that need multiple date perspectives
```sql
-- Multiple date fields for tracking
SELECT 
    so.datecreated AS order_date,
    so.dateissued AS issue_date,
    so.datefirstship AS first_ship_date,
    so.datecompleted AS completion_date,
    soitem.datescheduledfulfillment AS scheduled_date,
    soitem.datelastfulfillment AS last_fulfillment_date
```

---

## Complex Business Logic

### Return and Credit Handling
**When to use**: Sales reports that need accurate quantity calculations
```sql
-- Handle returns with negative quantities
SELECT 
    CASE WHEN soitem.typeid = 20  -- Return item type
         THEN postsoitem.qty * -1
         ELSE postsoitem.qty
    END AS actual_qty,
    
    -- Alternative method using IIF
    IIF(soitem.typeid = 20, -ABS(postsoitem.qty), postsoitem.qty) AS qty_shipped,
    
    -- Multiple return types
    IIF((soitem.typeid IN (20, 21)), -ABS(postsoitem.qty), postsoitem.qty) AS adjusted_qty
```

### Unit of Measure Conversions
**When to use**: Inventory reports with different UOM requirements
```sql
-- UOM conversion calculations
SELECT 
    part.num,
    postsoitem.qty AS base_qty,
    uom.code AS base_uom,
    -- Convert to alternative UOM
    (postsoitem.qty * (COALESCE(uomconversion.multiply, 1) / 
                      COALESCE(uomconversion.factor, 1))) AS converted_qty
FROM postsoitem
    INNER JOIN soitem ON postsoitem.soitemid = soitem.id
    INNER JOIN product ON soitem.productid = product.id
    INNER JOIN part ON product.partid = part.id
    LEFT JOIN uom ON part.uomid = uom.id
    LEFT JOIN uomconversion ON uomconversion.fromuomid = uom.id
```

### Drop Ship Order Tracking
**When to use**: Reports tracking special order types
```sql
-- Drop ship relationship tracking
SELECT 
    so.num AS sales_order,
    po.num AS purchase_order,
    vendor.name AS drop_ship_vendor,
    soitem.productnum,
    soitem.qtytofulfill AS qty_ordered,
    poitem.qtytoorder AS qty_on_po
FROM so
    INNER JOIN soitem ON so.id = soitem.soid
    -- Object-to-object relationship for SO->PO linking
    INNER JOIN objecttoobject oto ON (oto.typeid = 10 
                                     AND oto.recordid1 = soitem.id)
    INNER JOIN poitem ON poitem.id = oto.recordid2
    INNER JOIN po ON poitem.poid = po.id
    INNER JOIN vendor ON po.vendorid = vendor.id
WHERE customfieldbyname(so.customfields, 'Drop Ship') = 'true'
```

### Order Type Conditional Logic
**When to use**: Reports that handle multiple order types
```sql
-- Multi-order type handling (PO, SO, XO)
SELECT 
    receipt.id AS receipt_id,
    -- Order number based on type
    CASE WHEN receipt.ordertypeid = 10 THEN po.num      -- Purchase Order
         WHEN receipt.ordertypeid = 20 THEN so.num      -- Sales Order
         WHEN receipt.ordertypeid = 40 THEN xo.num      -- Transfer Order
    END AS order_number,
    
    -- Order source based on type
    CASE WHEN receipt.ordertypeid = 10 THEN vendor.name
         WHEN receipt.ordertypeid = 20 THEN customer.name
         WHEN receipt.ordertypeid = 40 THEN xolg.name
    END AS order_source,
    
    -- Notes based on type
    CASE WHEN receipt.ordertypeid = 10 THEN poitem.note
         WHEN receipt.ordertypeid = 20 THEN soitem.note
         WHEN receipt.ordertypeid = 40 THEN xoitem.note
    END AS order_notes
FROM receipt
    LEFT JOIN po ON (receipt.orderid = po.id AND receipt.ordertypeid = 10)
    LEFT JOIN so ON (receipt.orderid = so.id AND receipt.ordertypeid = 20)
    LEFT JOIN xo ON (receipt.orderid = xo.id AND receipt.ordertypeid = 40)
    LEFT JOIN vendor ON (po.vendorid = vendor.id AND receipt.ordertypeid = 10)
    LEFT JOIN customer ON (so.customerid = customer.id AND receipt.ordertypeid = 20)
    LEFT JOIN locationgroup xolg ON (xo.fromlgid = xolg.id AND receipt.ordertypeid = 40)
```

---

## Performance Optimization Patterns

### Efficient JOIN Strategies
**When to use**: Optimizing query performance
```sql
-- Use INNER JOINs for required relationships
FROM so
    INNER JOIN soitem ON so.id = soitem.soid          -- Always exists
    INNER JOIN customer ON customer.id = so.customerid -- Always exists
    
-- Use LEFT JOINs for optional relationships
    LEFT JOIN customerstatus ON customer.statusid = customerstatus.id  -- May be null
    LEFT JOIN contact ON (customer.accountid = contact.accountid        -- Optional
                         AND address.id = contact.addressid)
```

### Subquery vs JOIN Optimization
**When to use**: Choose based on data cardinality
```sql
-- Correlated subquery for single value lookup
SELECT 
    part.num,
    (SELECT vendor.name 
     FROM vendorparts 
     INNER JOIN vendor ON vendorparts.vendorid = vendor.id
     WHERE vendorparts.partid = part.id 
     AND vendorparts.defaultflag = 1
     LIMIT 1) AS default_vendor

-- JOIN approach for one-to-one relationships
SELECT 
    part.num,
    vendor.name AS default_vendor
FROM part
    LEFT JOIN vendorparts ON (vendorparts.partid = part.id 
                             AND vendorparts.defaultflag = 1)
    LEFT JOIN vendor ON vendor.id = vendorparts.vendorid
```

### Indexed Field Filtering
**When to use**: Optimizing WHERE clause performance
```sql
-- Filter on indexed fields first
WHERE so.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}  -- Indexed date
    AND so.statusid IN ($P{statusList})                          -- Indexed status
    AND customer.id LIKE $P{customerID}                          -- Indexed ID
    -- Then apply text filters
    AND UPPER(so.salesman) LIKE UPPER($P{salesPerson})          -- Text search
```

---

## Custom Field Integration

### Custom Field Table Approach
**When to use**: When custom fields are stored in separate tables
```sql
-- Join to custom field tables
SELECT 
    product.num,
    customset.info AS product_type
FROM product
    LEFT JOIN customset ON (customset.customfieldid = 61 
                           AND customset.recordid = product.id)
WHERE TRIM(COALESCE(customset.info, 'Undefined')) LIKE $P{productType}
```

### Custom Field Function Approach
**When to use**: When using Fishbowl's built-in custom field functions
```sql
-- Use custom field functions
SELECT 
    product.num,
    customfieldbyid(product.customfields, 61) AS product_type,
    customfieldbyname(so.customfields, 'Drop Ship') AS is_drop_ship
FROM product
    INNER JOIN soitem ON product.id = soitem.productid
    INNER JOIN so ON soitem.soid = so.id
WHERE customfieldbyname(so.customfields, 'Drop Ship') = 'true'
```

### Mixed Approach Pattern
**When to use**: Flexibility between table and function approaches
```sql
-- Combine both approaches with fallback
SELECT 
    product.num,
    -- Try function first, fall back to table lookup
    COALESCE(
        customfieldbyid(product.customfields, 61),
        customset.info,
        'Undefined'
    ) AS product_type
FROM product
    LEFT JOIN customset ON (customset.customfieldid = 61 
                           AND customset.recordid = product.id)
```

---

## Common Query Templates

### Customer Status Report Template
```sql
SELECT 
    customer.name AS customer_name,
    customer.jobdepth,
    COALESCE(customerstatus.name, '') AS status,
    address.name AS address_name,
    addresstype.name AS address_type,
    CONCAT(address.address, ', ', address.city, ', ', 
           COALESCE(stateconst.code, ''), ' ', 
           COALESCE(address.zip, '')) AS full_address,
    contact.contactname,
    contact.datus AS contact_info,
    contacttype.name AS contact_type
FROM customer
    INNER JOIN address ON customer.accountid = address.accountid
    INNER JOIN addresstype ON address.typeid = addresstype.id
    LEFT JOIN customerstatus ON customer.statusid = customerstatus.id
    LEFT JOIN contact ON (customer.accountid = contact.accountid 
                         AND address.id = contact.addressid)
    LEFT JOIN contacttype ON contact.typeid = contacttype.id
    LEFT JOIN countryconst ON address.countryid = countryconst.id
    LEFT JOIN stateconst ON address.stateid = stateconst.id
WHERE customer.id LIKE $P{customerID}
    AND UPPER(addresstype.name) LIKE UPPER($P{addressType})
    AND COALESCE(customerstatus.id, 0) IN ($P{statusList})
ORDER BY customer.name, address.name, contact.contactname
```

### Sales Performance Template
```sql
SELECT 
    so.salesmaninitials AS salesperson,
    customer.name AS customer_name,
    COUNT(DISTINCT so.id) AS order_count,
    SUM(soitem.qtytofulfill * soitem.unitprice) AS total_sales,
    AVG(soitem.unitprice) AS avg_unit_price,
    SUM(postsoitem.postedtotalcost) AS total_cogs,
    SUM((soitem.unitprice * postsoitem.qty) - postsoitem.postedtotalcost) AS total_margin,
    -- Margin percentage
    CASE WHEN SUM(soitem.unitprice * postsoitem.qty) > 0
         THEN (SUM((soitem.unitprice * postsoitem.qty) - postsoitem.postedtotalcost) /
               SUM(soitem.unitprice * postsoitem.qty)) * 100
         ELSE 0
    END AS margin_percent
FROM so
    INNER JOIN soitem ON so.id = soitem.soid
    INNER JOIN customer ON so.customerid = customer.id
    INNER JOIN postsoitem ON soitem.id = postsoitem.soitemid
WHERE postsoitem.datecreated BETWEEN $P{dateRange1} AND $P{dateRange2}
    AND UPPER(so.salesman) LIKE UPPER($P{salesPerson})
    AND customer.id LIKE $P{customerID}
GROUP BY so.salesmaninitials, customer.name
ORDER BY total_sales DESC
```

This cookbook provides practical, tested SQL patterns that can be adapted for various Fishbowl reporting needs. Each pattern includes context for when to use it and real examples from production systems.