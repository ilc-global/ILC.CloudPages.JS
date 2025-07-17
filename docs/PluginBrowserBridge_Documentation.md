# PluginBrowserBridge JavaScript Interface Documentation

## Overview

The PluginBrowserBridge provides the main JavaScript interface for Fishbowl applications to interact with the underlying Java system. This bridge enables web-based reports and applications to access database queries, API calls, file operations, reporting, printing, and window management directly from JavaScript.

All methods marked with `@JsAccessible` can be called from JavaScript running in the browser component.

---

## JavaScript Interface Methods

### Application Logging

#### logInformation(message)
Logs an informational message to the application log and console.

**Parameters:**
- `message` (String): The message to log

**Example:**
```javascript
fb_client.logInformation("Processing started for order 12345");
```

#### logError(message)
Logs an error message to the application log and console.

**Parameters:**
- `message` (String): The error message to log

**Example:**
```javascript
fb_client.logError("Failed to process order: Invalid customer ID");
```

#### logMessages()
Returns all logged messages for the current page session.

**Returns:** String containing all logged messages

**Example:**
```javascript
const allLogs = fb_client.logMessages();
console.log(allLogs);
```

#### serverLogMessages()
Retrieves server-side log messages.

**Returns:** String containing server log messages

**Example:**
```javascript
const serverLogs = fb_client.serverLogMessges();
```

---

### Database Operations

#### runQuery(sql)
Executes a SQL query without parameters.

**Parameters:**
- `sql` (String): SQL query to execute

**Returns:** JSON string containing query results or error information

**Example:**
```javascript
const results = fb_client.runQuery("SELECT * FROM part WHERE num LIKE 'ABC%'");
const data = JSON.parse(results);
```

#### runQueryParameters(sql, json_parameters)
Executes a SQL query with parameters to prevent SQL injection.

**Parameters:**
- `sql` (String): SQL query with parameter placeholders (use `:parameter_name` syntax)
- `json_parameters` (String): JSON object containing parameter values

**Returns:** JSON string containing query results or error information

**Example:**
```javascript
const sql = "SELECT * FROM so WHERE customerid = :customer_id AND dateissued >= :start_date";
const params = JSON.stringify({
    customer_id: "123",
    start_date: "2023-01-01"
});
const results = fb_client.runQueryParameters(sql, params);
const data = JSON.parse(results);
```

**Error Response Example:**
```json
{
    "is_error": true,
    "error_msg": "SQL syntax error: ..."
}
```

---

### REST API Operations

#### restApiCall(method, path, body)
Makes HTTP REST API calls to the Fishbowl API server using the current authentication token.

**Parameters:**
- `method` (String): HTTP method (GET, POST, PUT, DELETE)
- `path` (String): API endpoint path
- `body` (String): Request body (JSON string, null for GET requests)

**Returns:** JSON string with HTTP response details

**Example:**
```javascript
// GET request
const getResponse = fb_client.restApiCall("GET", "/api/part/1234", null);
const getData = JSON.parse(getResponse);

// POST request
const postData = JSON.stringify({
    name: "New Part",
    description: "Part description"
});
const postResponse = fb_client.restApiCall("POST", "/api/part", postData);
```

**Response Format:**
```json
{
    "http_code": "200",
    "response": "API response data",
    "is_error": false
}
```

---

### Legacy API Operations

#### runApiJSON(request_type, payload)
Executes legacy Fishbowl API requests using XML/JSON conversion.

**Parameters:**
- `request_type` (String): API call type (enum value from ApiCallType)
- `payload` (String): JSON request payload

**Returns:** JSON string containing API response

**Example:**
```javascript
const request = JSON.stringify({
    GetPartRq: {
        Number: "ABC-123"
    }
});
const response = fb_client.runApiJSON("GET_PART", request);
const data = JSON.parse(response);
```

#### runImportCSV(import_type, csv_data)
Imports CSV data using the legacy API.

**Parameters:**
- `import_type` (String): Type of import (e.g., "Part", "Customer", "SalesOrder")
- `csv_data` (String): CSV formatted data with headers

**Returns:** JSON string containing import results

**Example:**
```javascript
const csvData = `"PartNumber","Description","UOM"
"TEST-001","Test Part 1","ea"
"TEST-002","Test Part 2","ea"`;

const result = fb_client.runImportCSV("Part", csvData);
const importResult = JSON.parse(result);
```

#### runImportCSV_JSON(import_type, json_list_strings)
Imports data from a JSON array of CSV row strings.

**Parameters:**
- `import_type` (String): Type of import
- `json_list_strings` (String): JSON array of CSV row strings

**Example:**
```javascript
const csvRows = JSON.stringify([
    '"TEST-001","Test Part 1","ea"',
    '"TEST-002","Test Part 2","ea"'
]);
const result = fb_client.runImportCSV_JSON("Part", csvRows);
```

---

### Window Management

#### dialogClose()
Closes the current dialog window.

**Returns:** Boolean (always true)

**Example:**
```javascript
fb_client.dialogClose();
```

#### showStatusBar(show)
Shows or hides the status bar in the dialog.

**Parameters:**
- `show` (Boolean): Whether to show the status bar

**Example:**
```javascript
fb_client.showStatusBar(true);
```

#### toggleFullscreen()
Toggles fullscreen mode for the dialog window.

**Example:**
```javascript
fb_client.toggleFullscreen();
```

#### dialogStatus(msg)
Updates the dialog status message displayed in the status bar.

**Parameters:**
- `msg` (String): Status message to display

**Example:**
```javascript
fb_client.dialogStatus("Processing... Please wait");
```

#### pbUpdate(value)
Updates the progress bar value in the dialog.

**Parameters:**
- `value` (Integer): Progress value (0-100)

**Example:**
```javascript
for(let i = 0; i <= 100; i += 10) {
    fb_client.pbUpdate(i);
    // Perform work here
}
```

---

### Client Information

#### getCompanyName()
Gets the current company name from the database.

**Returns:** String company name

#### getUsername()
Gets the current user's username.

**Returns:** String username

#### getUserEmail()
Gets the current user's email address from the database.

**Returns:** String email address

#### getUserId()
Gets the current user's ID.

**Returns:** Integer user ID

#### getUsersGroupIDs()
Gets the current user's group IDs.

**Returns:** Array of string group IDs

#### getPluginName()
Gets the current plugin name.

**Returns:** String plugin name

#### getModuleName()
Gets the current module name.

**Returns:** String module name

#### getObjectId()
Gets the current object ID.

**Returns:** Integer object ID

**Example:**
```javascript
const userInfo = {
    company: fb_client.getCompanyName(),
    username: fb_client.getUsername(),
    email: fb_client.getUserEmail(),
    userId: fb_client.getUserId(),
    groupIds: fb_client.getUsersGroupIDs(),
    plugin: fb_client.getPluginName(),
    module: fb_client.getModuleName(),
    objectId: fb_client.getObjectId()
};
console.log("User Info:", userInfo);
```

#### hasAccessRight(name)
Checks if the current user has a specific access right.

**Parameters:**
- `name` (String): Access right name

**Returns:** Boolean indicating access

**Example:**
```javascript
if (fb_client.hasAccessRight("ViewInventory")) {
    // Show inventory data
} else {
    fb_client.logError("User lacks ViewInventory permission");
}
```

---

### Data Storage

#### savePluginDataByGroup(groupName, groupDataMap_JSON)
Saves plugin data for a specific group. This data persists between sessions.

**Parameters:**
- `groupName` (String): Group identifier
- `groupDataMap_JSON` (String): JSON object containing key-value pairs

**Returns:** Boolean (always true)

**Example:**
```javascript
const settings = JSON.stringify({
    theme: "dark",
    autoRefresh: "true",
    refreshInterval: "30"
});
fb_client.savePluginDataByGroup("user_preferences", settings);
```

#### getPluginData(groupName, key)
Retrieves plugin data for a specific group and key.

**Parameters:**
- `groupName` (String): Group identifier
- `key` (String): Data key

**Returns:** String value or null if not found

**Example:**
```javascript
const theme = fb_client.getPluginData("user_preferences", "theme") || "light";
```

#### deletePluginData(groupName)
Deletes all plugin data for a specific group.

**Parameters:**
- `groupName` (String): Group identifier

**Returns:** Boolean (always true)

**Example:**
```javascript
fb_client.deletePluginData("user_preferences");
```

---

### Navigation

#### hyperLink(module, param)
Navigates to a specific module with parameters.

**Parameters:**
- `module` (String): Module name (e.g., "Picking", "SalesOrder", "Part")
- `param` (String): Parameter value (usually an ID)

**Example:**
```javascript
// Navigate to a specific pick
fb_client.hyperLink("Picking", "12345");

// Navigate to a sales order
fb_client.hyperLink("SalesOrder", "SO-2023-001");
```

#### reloadObject()
Reloads the current object in the parent module.

**Returns:** Boolean (always true)

#### runScheduledTask(task_name)
Runs a scheduled task by name.

**Parameters:**
- `task_name` (String): Name of the scheduled task

**Example:**
```javascript
fb_client.runScheduledTask("DailyInventorySync");
```

---

### Reporting

#### previewReport(report_id, report_parameters)
Opens a report preview window with the specified parameters.

**Parameters:**
- `report_id` (String): Report ID from the Fishbowl database
- `report_parameters` (String): JSON object containing report parameters

**Example:**
```javascript
const params = JSON.stringify({
    StartDate: "2023-01-01",
    EndDate: "2023-12-31",
    CustomerID: "123"
});
fb_client.previewReport("45", params);
```

#### getReportPDF(report_id, report_parameters, throw_exception)
Generates a PDF report and returns it as base64 encoded data.

**Parameters:**
- `report_id` (String): Report ID
- `report_parameters` (String): JSON object containing report parameters
- `throw_exception` (Boolean): Whether to throw exceptions on error

**Returns:** JSON string containing base64 PDF data or error information

**Report Parameters by Type:**
```javascript
// Different parameter types supported
const params = JSON.stringify({
    // String parameters
    CustomerName: "ABC Company",
    
    // Integer parameters  
    CustomerID: 123,
    
    // Date parameters (yyyy-MM-dd format)
    StartDate: "2023-01-01",
    
    // Timestamp parameters (ISO format)
    StartDateTime: "2023-01-01T00:00:00",
    
    // Boolean parameters
    IncludeInactive: false,
    
    // Decimal parameters
    MinAmount: 100.50
});
```

**Example:**
```javascript
const params = JSON.stringify({
    StartDate: "2023-01-01",
    EndDate: "2023-12-31"
});
const pdfResult = fb_client.getReportPDF("45", params, false);
const pdfData = JSON.parse(pdfResult);

if (!pdfData.is_error) {
    // Use pdfData.pdf_bytes (base64 encoded PDF)
    const blob = new Blob([atob(pdfData.pdf_bytes)], {type: 'application/pdf'});
    const url = URL.createObjectURL(blob);
    window.open(url);
} else {
    fb_client.logError("Report generation failed: " + pdfData.message);
}
```

#### getMergedReportsPDF(report_dictionary_json)
Generates a merged PDF from multiple reports with specified copies.

**Parameters:**
- `report_dictionary_json` (String): JSON array of report definitions

**Returns:** Base64 encoded PDF string

**Report Dictionary Format:**
```javascript
const reportDict = JSON.stringify([
    {
        report_id: "45",
        copies: 1,
        params: {
            StartDate: "2023-01-01",
            EndDate: "2023-12-31"
        }
    },
    {
        report_id: "46", 
        copies: 2,
        params: {
            CustomerID: "123"
        }
    }
]);
const mergedPdf = fb_client.getMergedReportsPDF(reportDict);
```

---

### Printing

#### localPrinters()
Gets a list of available local printers.

**Returns:** JSON string containing printer names

**Example:**
```javascript
const printersResult = fb_client.localPrinters();
const printers = JSON.parse(printersResult);
console.log("Available printers:", printers.printers);

// Display in a dropdown
const select = document.getElementById('printerSelect');
printers.printers.forEach(printer => {
    const option = document.createElement('option');
    option.value = printer;
    option.textContent = printer;
    select.appendChild(option);
});
```

#### printPDF(printer_name, pdf_base64_bytes, show_print_dialog)
Prints a PDF document to a specified printer.

**Parameters:**
- `printer_name` (String): Name of the printer (must match exactly)
- `pdf_base64_bytes` (String): Base64 encoded PDF data
- `show_print_dialog` (Boolean): Whether to show print dialog

**Example:**
```javascript
const pdfBase64 = "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8..."; // Base64 PDF data
fb_client.printPDF("HP LaserJet Pro", pdfBase64, false);
```

#### printReportPDF(printer_name, copies, report_id, report_parameters, throw_exception)
Prints a report directly to a printer without generating intermediate files.

**Parameters:**
- `printer_name` (String): Printer name
- `copies` (Integer): Number of copies
- `report_id` (String): Report ID
- `report_parameters` (String): JSON report parameters
- `throw_exception` (Boolean): Whether to throw exceptions

**Example:**
```javascript
const params = JSON.stringify({
    OrderID: "12345"
});
fb_client.printReportPDF("Label Printer", 2, "67", params, false);
```

#### printMergedReportsPDF(printer_name, copies, report_dictionary_json)
Prints a merged PDF of multiple reports.

**Parameters:**
- `printer_name` (String): Printer name
- `copies` (Integer): Number of copies
- `report_dictionary_json` (String): JSON array of report definitions

#### printMultipleReports_JasperReports(report_dictionary_json, printer_name)
Prints multiple reports using JasperReports engine.

**Parameters:**
- `report_dictionary_json` (String): JSON array of report definitions
- `printer_name` (String): Printer name

#### printZPL(printer_name, zpl_document)
Prints a ZPL (Zebra Programming Language) document to a label printer.

**Parameters:**
- `printer_name` (String): Printer name
- `zpl_document` (String): ZPL formatted document

**Example:**
```javascript
const zplLabel = `
^XA
^FO20,20^A0N,25,25^FDPART NUMBER:^FS
^FO20,50^A0N,30,30^FDABC-123^FS
^FO20,90^A0N,25,25^FDQTY: 100^FS
^XZ
`;
fb_client.printZPL("Zebra ZT230", zplLabel);
```

---

### File Operations

#### getResourceFileString(file_name)
Reads a text file from the working directory and returns its contents.

**Parameters:**
- `file_name` (String): Relative file path from working directory

**Returns:** String file contents or empty string on error

**Security:** File access is restricted to the working directory to prevent directory traversal attacks.

**Example:**
```javascript
const templateHtml = fb_client.getResourceFileString("templates/report_template.html");
if (templateHtml) {
    document.getElementById('content').innerHTML = templateHtml;
} else {
    fb_client.logError("Template file not found");
}
```

#### getResourceFileAsBase64(file_name)
Reads a file as base64 encoded string (useful for binary files).

**Parameters:**
- `file_name` (String): Relative file path from working directory

**Returns:** Base64 encoded file contents or empty string on error

**Example:**
```javascript
const imageData = fb_client.getResourceFileAsBase64("images/logo.png");
if (imageData) {
    const imgElement = document.createElement('img');
    imgElement.src = 'data:image/png;base64,' + imageData;
    document.body.appendChild(imgElement);
}
```

#### saveDataToFile(dialogTitle, extension, extensionDescription, base64Data, fileName, openShell)
Shows a save dialog to save base64 data to a file.

**Parameters:**
- `dialogTitle` (String): Dialog title
- `extension` (String): File extension (e.g., "pdf", "xlsx")
- `extensionDescription` (String): Extension description (e.g., "PDF Files")
- `base64Data` (String): Base64 encoded file data
- `fileName` (String): Default filename (optional)
- `openShell` (Boolean): Whether to open file after saving (optional)

**Example:**
```javascript
// Generate a report and save it
const pdfResult = fb_client.getReportPDF("45", "{}", false);
const pdfData = JSON.parse(pdfResult);

if (!pdfData.is_error) {
    fb_client.saveDataToFile(
        "Save Report", 
        "pdf", 
        "PDF Files", 
        pdfData.pdf_bytes, 
        "inventory_report.pdf", 
        true
    );
}
```

---

### Developer Tools

#### listMethods()
Returns a list of all available JavaScript methods with their signatures.

**Returns:** JSON array of method signatures

**Example:**
```javascript
const methods = fb_client.listMethods();
const methodList = JSON.parse(methods);
console.log("Available methods:", methodList);

// Display methods in console for debugging
methodList.forEach(method => console.log(method));
```

---

## Common Usage Patterns

### 1. Loading and Displaying Data with Error Handling

```javascript
function loadInventoryData() {
    fb_client.dialogStatus("Loading inventory data...");
    fb_client.pbUpdate(0);
    
    const sql = `
        SELECT p.num, p.description, qoh.qty, p.activeflag
        FROM part p 
        LEFT JOIN qoh ON p.id = qoh.partid 
        WHERE p.activeflag = 1 
        ORDER BY p.num
    `;
    
    try {
        const results = fb_client.runQuery(sql);
        const data = JSON.parse(results);
        
        fb_client.pbUpdate(50);
        
        if (data.is_error) {
            fb_client.logError("Query failed: " + data.error_msg);
            fb_client.dialogStatus("Error loading data");
            return;
        }
        
        if (data.length > 0) {
            displayInventoryTable(data);
            fb_client.logInformation(`Loaded ${data.length} inventory items`);
            fb_client.pbUpdate(100);
            fb_client.dialogStatus(`Loaded ${data.length} items`);
        } else {
            fb_client.logInformation("No inventory data found");
            fb_client.dialogStatus("No data found");
        }
    } catch (error) {
        fb_client.logError("Error processing inventory data: " + error.message);
        fb_client.dialogStatus("Error");
    }
}
```

### 2. Report Generation with User Parameters

```javascript
function generateCustomerReport() {
    const customerId = document.getElementById('customerId').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!customerId || !startDate || !endDate) {
        fb_client.logError("All fields are required");
        return;
    }
    
    const params = JSON.stringify({
        CustomerID: parseInt(customerId),
        StartDate: startDate,
        EndDate: endDate
    });
    
    fb_client.pbUpdate(25);
    fb_client.dialogStatus("Generating report...");
    
    try {
        const pdfResult = fb_client.getReportPDF("12", params, false);
        const pdfData = JSON.parse(pdfResult);
        
        fb_client.pbUpdate(75);
        
        if (pdfData.is_error) {
            fb_client.logError("Report generation failed: " + pdfData.message);
            fb_client.dialogStatus("Report failed");
            return;
        }
        
        fb_client.pbUpdate(100);
        fb_client.dialogStatus("Report ready");
        
        // Save the report
        fb_client.saveDataToFile(
            "Save Customer Report",
            "pdf",
            "PDF Files", 
            pdfData.pdf_bytes,
            `customer_report_${customerId}_${startDate}_${endDate}.pdf`,
            true
        );
        
        fb_client.logInformation("Customer report generated successfully");
    } catch (error) {
        fb_client.logError("Error generating report: " + error.message);
        fb_client.dialogStatus("Error");
    }
}
```

### 3. Data Import with Validation

```javascript
function importPartsFromCSV(csvData) {
    fb_client.logInformation("Starting part import");
    fb_client.pbUpdate(0);
    fb_client.dialogStatus("Validating CSV data...");
    
    // Validate CSV format
    const lines = csvData.split('\n');
    if (lines.length < 2) {
        fb_client.logError("CSV must have at least a header and one data row");
        return;
    }
    
    fb_client.pbUpdate(25);
    fb_client.dialogStatus("Importing parts...");
    
    try {
        const result = fb_client.runImportCSV("Part", csvData);
        const importResult = JSON.parse(result);
        
        fb_client.pbUpdate(75);
        
        if (importResult.is_error) {
            fb_client.logError("Import failed: " + importResult.error_msg);
            fb_client.dialogStatus("Import failed");
        } else {
            fb_client.logInformation(`Parts imported successfully: ${lines.length - 1} rows processed`);
            fb_client.pbUpdate(100);
            fb_client.dialogStatus("Import complete");
            fb_client.reloadObject(); // Refresh the current view
        }
    } catch (error) {
        fb_client.logError("Import error: " + error.message);
        fb_client.dialogStatus("Import error");
    }
}
```

### 4. User Preferences with Defaults

```javascript
function saveUserPreferences() {
    const preferences = {
        theme: document.getElementById('theme').value,
        autoRefresh: document.getElementById('autoRefresh').checked.toString(),
        refreshInterval: document.getElementById('refreshInterval').value,
        dateFormat: document.getElementById('dateFormat').value
    };
    
    fb_client.savePluginDataByGroup("user_settings", JSON.stringify(preferences));
    fb_client.logInformation("User preferences saved");
    fb_client.dialogStatus("Settings saved");
}

function loadUserPreferences() {
    const defaultPrefs = {
        theme: "light",
        autoRefresh: false,
        refreshInterval: "30",
        dateFormat: "MM/dd/yyyy"
    };
    
    // Load each preference with fallback to default
    Object.keys(defaultPrefs).forEach(key => {
        const value = fb_client.getPluginData("user_settings", key) || defaultPrefs[key];
        const element = document.getElementById(key);
        
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = value === 'true';
            } else {
                element.value = value;
            }
        }
    });
    
    fb_client.logInformation("User preferences loaded");
}
```

### 5. Dynamic Printer Selection

```javascript
function setupPrinterSelection() {
    const printersResult = fb_client.localPrinters();
    const printers = JSON.parse(printersResult);
    
    const select = document.getElementById('printerSelect');
    select.innerHTML = '<option value="">Select a printer...</option>';
    
    printers.printers.forEach(printer => {
        const option = document.createElement('option');
        option.value = printer;
        option.textContent = printer;
        select.appendChild(option);
    });
    
    // Restore previously selected printer
    const savedPrinter = fb_client.getPluginData("print_settings", "default_printer");
    if (savedPrinter) {
        select.value = savedPrinter;
    }
    
    // Save printer selection
    select.addEventListener('change', function() {
        if (this.value) {
            fb_client.savePluginDataByGroup("print_settings", JSON.stringify({
                default_printer: this.value
            }));
        }
    });
}
```

---

## Error Handling Best Practices

### 1. Always Parse and Check JSON Results
```javascript
function safeQuery(sql) {
    try {
        const results = fb_client.runQuery(sql);
        const data = JSON.parse(results);
        
        if (data.is_error) {
            fb_client.logError("Query failed: " + data.error_msg);
            return null;
        }
        
        return data;
    } catch (error) {
        fb_client.logError("Error parsing query results: " + error.message);
        return null;
    }
}
```

### 2. Validate Parameters Before API Calls
```javascript
function validateAndExecute(operation, params) {
    // Validate required parameters
    if (!params.customerId || !params.startDate) {
        fb_client.logError("Missing required parameters");
        return false;
    }
    
    // Validate data types
    if (isNaN(parseInt(params.customerId))) {
        fb_client.logError("Customer ID must be a number");
        return false;
    }
    
    // Proceed with operation
    return operation(params);
}
```

### 3. Use Try-Catch for All Bridge Operations
```javascript
function safeReportGeneration(reportId, params) {
    try {
        fb_client.dialogStatus("Generating report...");
        const result = fb_client.getReportPDF(reportId, JSON.stringify(params), false);
        const data = JSON.parse(result);
        
        if (data.is_error) {
            throw new Error(data.message);
        }
        
        return data;
    } catch (error) {
        fb_client.logError("Report generation failed: " + error.message);
        fb_client.dialogStatus("Report failed");
        return null;
    }
}
```

---

## Performance Tips

1. **Use Progress Updates**: For long operations, update progress and status regularly
2. **Batch Database Operations**: Use parameterized queries for multiple similar operations
3. **Cache Static Data**: Store frequently accessed lookup data using plugin data storage
4. **Validate Early**: Check user inputs before making expensive API calls
5. **Handle Large Results**: Process large datasets in chunks to avoid memory issues

---

## Security Considerations

1. **SQL Injection Prevention**: Always use `runQueryParameters()` instead of string concatenation
2. **Access Control**: Check user permissions with `hasAccessRight()` before sensitive operations
3. **File Security**: File operations are restricted to the working directory
4. **Input Validation**: Validate all user inputs before processing
5. **Error Information**: Don't expose sensitive system information in error messages

This documentation provides a comprehensive guide for developers to build applications and reports using the PluginBrowserBridge interface.