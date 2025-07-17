# CloudPages.js Testing Plan

## Overview

This document outlines the comprehensive testing strategy for the CloudPages.js framework, focusing on a layered approach that combines fast Node.js unit tests with browser-based integration testing. The strategy emphasizes testing business logic separately from DOM manipulation to achieve reliable, maintainable tests.

## Testing Philosophy

### **Development Workflow**
```
Feature Development → Browser Testing → Unit Test Lock-down → CI/CD
```

**Rationale**: Develop features iteratively using browser testing for immediate feedback, then lock down the business logic with fast unit tests to prevent regressions.

### **Testing Pyramid Structure**

```
        /\
       /  \
      /    \  E2E Tests (Browser)
     /      \  - Full workflows
    /        \  - User scenarios
   /          \
  /____________\
 /              \
/                \ Integration Tests (JSDOM)
\                / - DOM manipulation
 \              /  - Component testing
  \____________/
 /              \
/                \ Unit Tests (Node.js)
\                / - Pure logic
 \              /  - Data transformation
  \____________/  - Validation functions
```

## Testing Architecture

### **Layer 1: Pure Logic Unit Tests (Node.js + Jest)**

#### **What to Test**
- Parameter validation logic
- Data transformation functions
- Query building logic
- Formatting functions
- Business rule validation
- Error handling logic

#### **Benefits**
- ⚡ **Fast execution** (milliseconds)
- 🔒 **Reliable** (no browser dependencies)
- 🐛 **Easy debugging** (simple function calls)
- 🚀 **CI/CD friendly** (runs anywhere)

#### **Example Test Structure**
```javascript
// tests/unit/parameter-validation.test.js
const { validateParameter, validateRange, transformParameterData } = require('../../js/cloudpages-logic');

describe('Parameter Validation', () => {
    describe('Required Field Validation', () => {
        test('should fail when required field is empty', () => {
            const param = { label: 'Customer', required: true };
            expect(validateParameter(param, '')).toEqual({
                valid: false,
                error: 'Customer is required'
            });
        });
        
        test('should pass when required field has value', () => {
            const param = { label: 'Customer', required: true };
            expect(validateParameter(param, 'ABC Corp')).toEqual({
                valid: true
            });
        });
    });
    
    describe('Type Validation', () => {
        test('should validate integer type', () => {
            const param = { label: 'Amount', type: 'int' };
            expect(validateParameter(param, 'abc')).toEqual({
                valid: false,
                error: 'Amount must be a number'
            });
            expect(validateParameter(param, '123')).toEqual({
                valid: true
            });
        });
        
        test('should validate percentage range', () => {
            const param = { label: 'Discount', type: 'pct' };
            expect(validateParameter(param, '150')).toEqual({
                valid: false,
                error: 'Discount must be between 0 and 100'
            });
            expect(validateParameter(param, '25')).toEqual({
                valid: true
            });
        });
    });
    
    describe('Range Validation', () => {
        test('should validate date ranges', () => {
            expect(validateRange('2023-01-01', '2023-12-31', 'date')).toBe(true);
            expect(validateRange('2023-12-31', '2023-01-01', 'date')).toBe(false);
        });
        
        test('should validate number ranges', () => {
            expect(validateRange('10', '20', 'number')).toBe(true);
            expect(validateRange('20', '10', 'number')).toBe(false);
        });
    });
});

// tests/unit/data-transformation.test.js
describe('Data Transformation', () => {
    test('should transform parameter data correctly', () => {
        const parameters = {
            customer: { type: 'dropdown', mode: 'single' },
            dateRange: { type: 'date', mode: 'range' }
        };
        
        const formData = {
            customer: '123',
            dateRange_start: '2023-01-01',
            dateRange_end: '2023-12-31'
        };
        
        const result = transformParameterData(parameters, formData);
        
        expect(result).toEqual({
            customer: '123',
            dateRange_start: '2023-01-01',
            dateRange_end: '2023-12-31'
        });
    });
});

// tests/unit/query-building.test.js
describe('Query Building', () => {
    test('should build parameterized query', () => {
        const baseQuery = "SELECT * FROM customer WHERE active = 1";
        const filters = {
            customerId: '123',
            customerName: 'ABC Corp'
        };
        
        const result = buildParameterizedQuery(baseQuery, filters);
        
        expect(result.query).toBe(
            "SELECT * FROM customer WHERE active = 1 AND customer.id = :customer_id AND customer.name LIKE :customer_name"
        );
        expect(result.params).toEqual({
            customer_id: '123',
            customer_name: '%ABC Corp%'
        });
    });
});
```

### **Layer 2: DOM Unit Tests (JSDOM)**

#### **What to Test**
- Form element creation
- DOM manipulation functions
- Event handler attachment
- CSS class management
- Element attribute setting

#### **Benefits**
- 🏃 **Faster than browser** (but slower than pure Node.js)
- 🎯 **Focused testing** (specific DOM functions)
- 🔧 **Isolated** (no external dependencies)

#### **Example Test Structure**
```javascript
// tests/dom/form-generation.test.js
/**
 * @jest-environment jsdom
 */
const { createFormGroup, createDropdownElement } = require('../../js/cloudpages-dom');

describe('Form Generation', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });
    
    describe('createFormGroup', () => {
        test('should create text input form group', () => {
            const parameter = { 
                label: 'Customer Name', 
                type: 'text', 
                required: true 
            };
            
            const formGroup = createFormGroup('customerName', parameter);
            
            expect(formGroup.className).toBe('form-group');
            expect(formGroup.querySelector('label').textContent).toBe('Customer Name*');
            expect(formGroup.querySelector('input').type).toBe('text');
            expect(formGroup.querySelector('input').required).toBe(true);
            expect(formGroup.querySelector('input').id).toBe('customerName');
        });
        
        test('should create dropdown form group', () => {
            const parameter = { 
                label: 'Status', 
                type: 'dropdown',
                mode: 'single'
            };
            
            const formGroup = createFormGroup('status', parameter);
            
            expect(formGroup.querySelector('select')).toBeTruthy();
            expect(formGroup.querySelector('select').id).toBe('status');
            expect(formGroup.querySelector('label').textContent).toBe('Status');
        });
        
        test('should create date range form group', () => {
            const parameter = { 
                label: 'Date Range', 
                type: 'date',
                mode: 'range'
            };
            
            const formGroup = createFormGroup('dateRange', parameter);
            
            expect(formGroup.querySelector('#dateRange_start')).toBeTruthy();
            expect(formGroup.querySelector('#dateRange_end')).toBeTruthy();
            expect(formGroup.querySelector('#dateRange_start').type).toBe('date');
        });
    });
    
    describe('createDropdownElement', () => {
        test('should create dropdown with options', () => {
            const options = [
                { value: '1', text: 'Option 1' },
                { value: '2', text: 'Option 2' }
            ];
            
            const parameter = { mode: 'single' };
            const dropdown = createDropdownElement('test', options, parameter);
            
            expect(dropdown.tagName).toBe('SELECT');
            expect(dropdown.options.length).toBe(3); // Including default option
            expect(dropdown.options[1].value).toBe('1');
            expect(dropdown.options[1].text).toBe('Option 1');
        });
        
        test('should create multi-select dropdown', () => {
            const options = [
                { value: '1', text: 'Option 1' }
            ];
            
            const parameter = { mode: 'multi' };
            const dropdown = createDropdownElement('test', options, parameter);
            
            expect(dropdown.multiple).toBe(true);
        });
    });
});

// tests/dom/table-rendering.test.js
describe('Table Rendering', () => {
    test('should render table with data', () => {
        document.body.innerHTML = '<div id="tableContainer"></div>';
        
        const data = [
            { name: 'John', age: 30, city: 'New York' },
            { name: 'Jane', age: 25, city: 'Boston' }
        ];
        
        const columns = {
            name: { format: 'text' },
            age: { format: 'number' },
            city: { format: 'text' }
        };
        
        const settings = {
            amount_unit_format: '$0.00',
            qty_unit_format: '0.00'
        };
        
        renderTable(data, columns, settings, 'tableContainer');
        
        const table = document.querySelector('#tableContainer table');
        expect(table).toBeTruthy();
        expect(table.rows.length).toBe(3); // Header + 2 data rows
        expect(table.rows[0].cells[0].textContent).toBe('Name');
        expect(table.rows[1].cells[0].textContent).toBe('John');
    });
});
```

### **Layer 3: Integration Tests (Browser-based)**

#### **What to Test**
- Complete user workflows
- Form submission processes
- Database integration
- Export functionality
- Cross-browser compatibility

#### **Benefits**
- 🌐 **Real environment** (actual browser)
- 👤 **User perspective** (full workflows)
- 🔗 **System integration** (database, API)

#### **Example Test Structure**
```javascript
// tests/integration/parameter-workflow.test.js
const { test, expect } = require('@playwright/test');

describe('Parameter Workflow', () => {
    test('complete form submission workflow', async ({ page }) => {
        await page.goto('/tests/parameter/01_Primitives.html');
        
        // Fill out form
        await page.fill('#customerName', 'ABC Corporation');
        await page.fill('#amount', '1000');
        await page.selectOption('#status', 'active');
        await page.check('#newsletter');
        
        // Submit form
        await page.click('#submitButton');
        
        // Verify results
        await expect(page.locator('#submitMessage')).toContainText('Form submitted successfully');
        await expect(page.locator('#tableContainer table')).toBeVisible();
    });
    
    test('database parameter autocomplete', async ({ page }) => {
        await page.goto('/tests/parameter/03_DatabaseParameters.html');
        
        // Type in autocomplete field
        await page.fill('#customer', 'ABC');
        
        // Wait for results
        await page.waitForSelector('.autocomplete-results');
        
        // Verify results appear
        const results = await page.locator('.autocomplete-item');
        await expect(results).toHaveCount(3);
        
        // Select first result
        await results.first().click();
        
        // Verify selection
        const selectedValue = await page.inputValue('#customer');
        expect(selectedValue).toBe('ABC Corporation');
    });
    
    test('export functionality', async ({ page }) => {
        await page.goto('/tests/parameter/07_Export.html');
        
        // Fill form and run report
        await page.fill('#dateRange_start', '2023-01-01');
        await page.fill('#dateRange_end', '2023-12-31');
        await page.click('#submitButton');
        
        // Wait for results
        await page.waitForSelector('#tableContainer table');
        
        // Test Excel export
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.click('#exportBtn')
        ]);
        
        expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    });
});

// tests/integration/error-handling.test.js
describe('Error Handling', () => {
    test('should handle SQL query errors gracefully', async ({ page }) => {
        // Mock SQL error
        await page.route('**/api/query', route => {
            route.fulfill({
                status: 500,
                body: JSON.stringify({ is_error: true, error_msg: 'Database connection failed' })
            });
        });
        
        await page.goto('/tests/parameter/03_DatabaseParameters.html');
        await page.fill('#customer', 'ABC');
        
        // Verify error message appears
        await expect(page.locator('#statusMessage')).toContainText('Database connection failed');
        await expect(page.locator('#statusMessage')).toHaveClass(/status-error/);
    });
});
```

## Code Refactoring for Testability

### **Current Problem: Tightly Coupled Code**
```javascript
// Hard to test - DOM tightly coupled with logic
function createDropdown(key, parameter) {
    const dropdown = document.createElement('select');
    dropdown.className = 'form-control';
    
    var results = fb_client.runQuery(parameter.sql);  // External dependency
    var results_obj = JSON.parse(results);
    
    results_obj.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.setAttribute('value', option[parameter.value]);
        optionElement.textContent = displayText;
        dropdown.appendChild(optionElement);
    });
    
    return dropdown;
}
```

### **Solution: Separated Concerns**

#### **Step 1: Extract Pure Logic**
```javascript
// js/cloudpages-logic.js (Node.js compatible)
function buildDropdownOptions(data, parameter) {
    return data.map(option => {
        const displayFields = parameter.display.split(',');
        const displayText = displayFields.map(field => option[field]).join(', ');
        return {
            value: option[parameter.value],
            text: displayText
        };
    });
}

function validateParameter(parameter, value) {
    if (parameter.required && (!value || value === '')) {
        return { valid: false, error: `${parameter.label} is required` };
    }
    
    if (parameter.type === 'int' && isNaN(parseInt(value))) {
        return { valid: false, error: `${parameter.label} must be a number` };
    }
    
    if (parameter.type === 'pct') {
        const num = parseFloat(value);
        if (num < 0 || num > 100) {
            return { valid: false, error: `${parameter.label} must be between 0 and 100` };
        }
    }
    
    return { valid: true };
}

function validateRange(startValue, endValue, type) {
    if (type === 'date') {
        return new Date(startValue) <= new Date(endValue);
    }
    return parseFloat(startValue) <= parseFloat(endValue);
}

function transformParameterData(parameters, formData) {
    const result = {};
    Object.keys(parameters).forEach(key => {
        const param = parameters[key];
        
        if (param.type === 'date' && param.mode === 'range') {
            result[key + '_start'] = formData[key + '_start'];
            result[key + '_end'] = formData[key + '_end'];
        } else if (param.type === 'dropdown' && param.mode === 'multi') {
            result[key] = Array.isArray(formData[key]) ? formData[key].join(',') : formData[key];
        } else {
            result[key] = formData[key];
        }
    });
    return result;
}

function buildParameterizedQuery(baseQuery, filters) {
    let query = baseQuery;
    let params = {};
    
    Object.keys(filters).forEach(key => {
        if (filters[key]) {
            if (key.includes('_start')) {
                const baseKey = key.replace('_start', '');
                query += ` AND ${baseKey} >= :${key}`;
                params[key] = filters[key];
            } else if (key.includes('_end')) {
                const baseKey = key.replace('_end', '');
                query += ` AND ${baseKey} <= :${key}`;
                params[key] = filters[key];
            } else {
                query += ` AND ${key} = :${key}`;
                params[key] = filters[key];
            }
        }
    });
    
    return { query, params };
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildDropdownOptions,
        validateParameter,
        validateRange,
        transformParameterData,
        buildParameterizedQuery
    };
}
```

#### **Step 2: Create DOM Layer**
```javascript
// js/cloudpages-dom.js (Browser only)
function createDropdownElement(key, options, parameter) {
    const dropdown = document.createElement('select');
    dropdown.className = 'form-control';
    dropdown.setAttribute('id', key);
    
    if (parameter.required) {
        dropdown.setAttribute('required', 'required');
    }
    
    if (parameter.mode === 'multi') {
        dropdown.setAttribute('multiple', 'multiple');
    }
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.textContent = 'Select an option';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    defaultOption.setAttribute('value', '');
    dropdown.appendChild(defaultOption);
    
    // Add data options
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.setAttribute('value', option.value);
        optionElement.textContent = option.text;
        dropdown.appendChild(optionElement);
    });
    
    return dropdown;
}

function createFormGroup(key, parameter) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // Create label
    const labelElement = document.createElement('label');
    labelElement.textContent = parameter.label;
    if (parameter.required) {
        const asterisk = document.createElement('span');
        asterisk.textContent = '*';
        asterisk.className = 'required-asterisk';
        labelElement.appendChild(asterisk);
    }
    formGroup.appendChild(labelElement);
    
    // Create input element based on type
    let inputElement;
    switch (parameter.type) {
        case 'text':
            inputElement = document.createElement('input');
            inputElement.setAttribute('type', 'text');
            inputElement.className = 'form-control';
            inputElement.setAttribute('id', key);
            break;
            
        case 'date':
            if (parameter.mode === 'range') {
                inputElement = createDateRangeInput(key);
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'date');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key);
            }
            break;
            
        case 'dropdown':
            // This would be populated with actual data later
            inputElement = createDropdownElement(key, [], parameter);
            break;
            
        default:
            inputElement = document.createElement('input');
            inputElement.setAttribute('type', 'text');
            inputElement.className = 'form-control';
            inputElement.setAttribute('id', key);
    }
    
    formGroup.appendChild(inputElement);
    
    // Add error element
    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);
    
    return formGroup;
}

function createDateRangeInput(key) {
    const rangeGroup = document.createElement('div');
    rangeGroup.className = 'date-range-group';
    
    const startInput = document.createElement('input');
    startInput.setAttribute('type', 'date');
    startInput.className = 'form-control';
    startInput.setAttribute('id', key + '_start');
    
    const endInput = document.createElement('input');
    endInput.setAttribute('type', 'date');
    endInput.className = 'form-control';
    endInput.setAttribute('id', key + '_end');
    
    rangeGroup.appendChild(startInput);
    rangeGroup.appendChild(document.createTextNode(' to '));
    rangeGroup.appendChild(endInput);
    
    return rangeGroup;
}
```

#### **Step 3: Main Integration Layer**
```javascript
// js/cloudpages.js (Main application)
async function createDropdown(key, parameter) {
    try {
        // Get data using safe query
        const results = await safeQuery(parameter.sql);
        if (!results) {
            showStatus('Failed to load dropdown data', 'error');
            return createDropdownElement(key, [], parameter);
        }
        
        // Transform data using pure logic
        const options = buildDropdownOptions(results, parameter);
        
        // Create DOM element
        return createDropdownElement(key, options, parameter);
        
    } catch (error) {
        console.error('Error creating dropdown:', error);
        showStatus('Error loading dropdown', 'error');
        return createDropdownElement(key, [], parameter);
    }
}

function validateParameters(parameters) {
    let isValid = true;
    
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        const element = document.getElementById(key);
        
        if (element) {
            const value = element.value;
            const validation = validateParameter(parameter, value);
            
            const errorElement = document.getElementById(key + '_error');
            if (!validation.valid) {
                errorElement.textContent = validation.error;
                element.classList.add('is-invalid');
                isValid = false;
            } else {
                errorElement.textContent = '';
                element.classList.remove('is-invalid');
            }
        }
    });
    
    return isValid;
}
```

## Test Environment Setup

### **Project Structure**
```
project/
├── js/
│   ├── cloudpages-logic.js      # Pure logic (Node.js compatible)
│   ├── cloudpages-dom.js        # DOM functions (Browser only)
│   ├── cloudpages.js            # Main application
│   └── fishbowl.js              # Utilities
├── tests/
│   ├── unit/                    # Node.js unit tests
│   │   ├── parameter-validation.test.js
│   │   ├── data-transformation.test.js
│   │   └── query-building.test.js
│   ├── dom/                     # JSDOM tests
│   │   ├── form-generation.test.js
│   │   └── table-rendering.test.js
│   └── integration/             # Browser tests
│       ├── parameter-workflow.test.js
│       └── error-handling.test.js
├── package.json
├── jest.config.js
└── playwright.config.js
```

### **Package.json Configuration**
```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:dom && npm run test:integration",
    "test:unit": "jest --testPathPattern=tests/unit",
    "test:dom": "jest --testPathPattern=tests/dom",
    "test:integration": "playwright test",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "jsdom": "^20.0.0",
    "@playwright/test": "^1.30.0",
    "@jest/globals": "^29.0.0"
  }
}
```

### **Jest Configuration**
```javascript
// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'unit-logic',
      testEnvironment: 'node',
      testMatch: ['**/tests/unit/**/*.test.js'],
      coverageDirectory: 'coverage/unit',
      collectCoverageFrom: [
        'js/cloudpages-logic.js',
        'js/fishbowl.js'
      ]
    },
    {
      displayName: 'dom-tests',
      testEnvironment: 'jsdom',
      testMatch: ['**/tests/dom/**/*.test.js'],
      coverageDirectory: 'coverage/dom',
      collectCoverageFrom: [
        'js/cloudpages-dom.js'
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/jsdom.js']
    }
  ],
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/**/*.test.js'
  ],
  coverageReporters: ['text', 'html', 'lcov']
};
```

### **JSDOM Setup**
```javascript
// tests/setup/jsdom.js
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = window.document;
global.navigator = window.navigator;

// Mock fb_client for testing
global.fb_client = {
  runQuery: jest.fn(),
  runQueryParameters: jest.fn(),
  logError: jest.fn(),
  dialogStatus: jest.fn(),
  pbUpdate: jest.fn()
};
```

### **Playwright Configuration**
```javascript
// playwright.config.js
module.exports = {
  testDir: './tests/integration',
  timeout: 30000,
  retries: 2,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 0,
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...require('@playwright/test').devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...require('@playwright/test').devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...require('@playwright/test').devices['Desktop Safari'] }
    }
  ]
};
```

## Mock Strategy

### **Mock fb_client for Unit Tests**
```javascript
// tests/mocks/fb_client.js
const mockFbClient = {
  runQuery: jest.fn(),
  runQueryParameters: jest.fn(),
  logError: jest.fn(),
  dialogStatus: jest.fn(),
  pbUpdate: jest.fn(),
  getPluginData: jest.fn(),
  savePluginDataByGroup: jest.fn()
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

module.exports = mockFbClient;
```

### **Mock Data for Testing**
```javascript
// tests/fixtures/sample-data.js
module.exports = {
  customers: [
    { id: 1, name: 'ABC Corporation', description: 'Large enterprise client' },
    { id: 2, name: 'XYZ Inc', description: 'Mid-size company' }
  ],
  
  salesOrders: [
    { so_num: 'SO-001', customer_name: 'ABC Corporation', total: 1000.00 },
    { so_num: 'SO-002', customer_name: 'XYZ Inc', total: 750.50 }
  ],
  
  parameters: {
    customer: {
      label: 'Customer',
      type: 'dropdown',
      sql: 'SELECT id, name, description FROM customer',
      mode: 'single',
      value: 'id',
      display: 'name,description',
      required: true
    },
    
    dateRange: {
      label: 'Date Range',
      type: 'date',
      mode: 'range',
      required: true
    },
    
    amount: {
      label: 'Amount',
      type: 'amt',
      required: false
    }
  }
};
```

## Continuous Integration

### **GitHub Actions Workflow**
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run DOM tests
        run: npm run test:dom
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-results
          path: test-results/
```

## Test Data Management

### **Test Database Setup**
```javascript
// tests/setup/test-database.js
const testData = {
  setupTestDatabase: async () => {
    // Mock database responses for testing
    const mockQueries = {
      'SELECT id, name FROM customer': [
        { id: 1, name: 'ABC Corp' },
        { id: 2, name: 'XYZ Inc' }
      ],
      'SELECT * FROM part WHERE active = 1': [
        { id: 1, num: 'PART-001', description: 'Test Part 1' },
        { id: 2, num: 'PART-002', description: 'Test Part 2' }
      ]
    };
    
    return mockQueries;
  }
};

module.exports = testData;
```

## Performance Testing

### **Load Testing for Search Functions**
```javascript
// tests/performance/search-performance.test.js
describe('Search Performance', () => {
  test('autocomplete should respond within 500ms', async () => {
    const start = performance.now();
    
    // Simulate search with 1000 records
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Customer ${i}`,
      description: `Description ${i}`
    }));
    
    const results = performAutocompleteSearch('ABC', largeDataset);
    
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
    expect(results.length).toBeGreaterThan(0);
  });
});
```

## Success Metrics

### **Test Coverage Targets**
- **Unit Tests**: >90% coverage for logic functions
- **DOM Tests**: >80% coverage for DOM functions
- **Integration Tests**: >70% coverage for user workflows

### **Performance Benchmarks**
- **Unit Tests**: <100ms per test suite
- **DOM Tests**: <500ms per test suite
- **Integration Tests**: <30s per test suite

### **Quality Gates**
- All tests must pass before merge
- No decrease in test coverage
- No performance regressions
- Zero critical security vulnerabilities

## Implementation Timeline

### **Phase 1: Foundation (Week 1-2)**
- Extract pure logic functions
- Set up Jest and testing infrastructure
- Write initial unit tests for validation

### **Phase 2: DOM Testing (Week 3-4)**
- Set up JSDOM environment
- Write DOM function tests
- Refactor existing DOM code

### **Phase 3: Integration (Week 5-6)**
- Set up Playwright
- Write end-to-end workflow tests
- Add performance monitoring

### **Phase 4: CI/CD (Week 7-8)**
- Set up GitHub Actions
- Add automated test reporting
- Implement quality gates

This comprehensive testing strategy ensures reliable, maintainable code while providing fast feedback during development.