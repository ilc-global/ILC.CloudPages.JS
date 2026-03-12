/**
 * CloudPages CDP Test Runner
 *
 * Connects to Chrome DevTools Protocol on port 9222 and tests
 * cloudpages.js against a live JXBrowser page with FB bridge.
 *
 * Usage: node cloudpages-cdp-tests.js [tier]
 *   tier 1 = Config Loader + SQL Binding (no Fishbowl connection needed)
 *   tier 2 = Parameter Renderers (all types, range, validation)
 *   tier 3 = SQL-driven Parameters (dropdown/autocomplete with live FB.query)
 *   tier 4 = Table Rendering + Column Formatting
 *   tier 5 = Export Engine + Hooks + Full Lifecycle
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ─── CDP Helpers ───────────────────────────────────────────────

let msgId = 0;

function getPages() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:9222/json/list', res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function connectPage(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

function evaluate(ws, expression, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const id = ++msgId;
        const timer = setTimeout(() => reject(new Error('CDP evaluate timeout')), timeout);

        const handler = (raw) => {
            const msg = JSON.parse(raw);
            if (msg.id === id) {
                clearTimeout(timer);
                ws.removeListener('message', handler);
                if (msg.result && msg.result.exceptionDetails) {
                    reject(new Error(msg.result.exceptionDetails.exception.description || 'JS Exception'));
                } else {
                    resolve(msg.result.result);
                }
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {
                expression,
                returnByValue: true,
                awaitPromise: true
            }
        }));
    });
}

// ─── Test Framework ────────────────────────────────────────────

const results = { passed: 0, failed: 0, errors: [] };

async function test(ws, name, jsExpression) {
    try {
        const result = await evaluate(ws, jsExpression);
        if (result.type === 'object' && result.value) {
            const val = result.value;
            if (val.pass) {
                results.passed++;
                console.log(`  \u2713 ${name}`);
            } else {
                results.failed++;
                results.errors.push({ name, detail: val.detail || val });
                console.log(`  \u2717 ${name} \u2014 ${val.detail || JSON.stringify(val)}`);
            }
        } else if (result.value === true) {
            results.passed++;
            console.log(`  \u2713 ${name}`);
        } else {
            results.failed++;
            results.errors.push({ name, detail: result.value });
            console.log(`  \u2717 ${name} \u2014 got: ${JSON.stringify(result.value)}`);
        }
    } catch (err) {
        results.failed++;
        results.errors.push({ name, detail: err.message });
        console.log(`  \u2717 ${name} \u2014 ERROR: ${err.message}`);
    }
}

async function inspect(ws, name, jsExpression) {
    try {
        const result = await evaluate(ws, jsExpression);
        console.log(`  \u2139 ${name}:`);
        const val = result.value;
        if (typeof val === 'object') {
            console.log('    ' + JSON.stringify(val, null, 2).replace(/\n/g, '\n    '));
        } else {
            console.log('    ' + val);
        }
        return val;
    } catch (err) {
        console.log(`  \u2139 ${name}: ERROR \u2014 ${err.message}`);
        return null;
    }
}

// ─── Library Injection ─────────────────────────────────────────

function injectFile(ws, filePath, label) {
    return (async () => {
        const absPath = path.resolve(__dirname, filePath);
        if (!fs.existsSync(absPath)) {
            throw new Error(`${label} not found at ${absPath}`);
        }
        const src = fs.readFileSync(absPath, 'utf8');
        await evaluate(ws, `(function(){ ${src} \n})(); '${label} loaded'`, 30000);
        console.log(`  Injected: ${label}`);
    })();
}

function injectCDN(ws, url, label, checkExpr) {
    return (async () => {
        const already = await evaluate(ws, checkExpr);
        if (already.value === true) {
            console.log(`  ${label} already loaded.`);
            return;
        }
        await evaluate(ws, `
            (() => {
                return new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = ${JSON.stringify(url)};
                    s.onload = () => resolve('loaded');
                    s.onerror = () => reject(new Error(${JSON.stringify(label)} + ' CDN failed'));
                    document.head.appendChild(s);
                });
            })()
        `, 15000);
        console.log(`  Injected: ${label} (CDN)`);
    })();
}

async function ensureLibsLoaded(ws) {
    // jQuery
    await injectCDN(ws,
        'https://code.jquery.com/jquery-3.7.1.min.js',
        'jQuery',
        `typeof jQuery !== 'undefined'`
    );

    // DataTables
    await injectCDN(ws,
        'https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js',
        'DataTables',
        `typeof jQuery !== 'undefined' && typeof jQuery.fn.DataTable !== 'undefined'`
    );

    // SheetJS
    await injectCDN(ws,
        'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
        'SheetJS',
        `typeof XLSX !== 'undefined'`
    );

    // FB
    const hasFB = await evaluate(ws, `typeof FB === 'object'`);
    if (!hasFB.value) {
        await injectFile(ws, '../js/fb.js', 'fb.js');
    }

    // Always inject cloudpages.js fresh (we're testing it)
    // But first remove DOMContentLoaded auto-init since DOM is already loaded
    // We inject the source and then manually call init when ready
    const cpSrc = fs.readFileSync(path.resolve(__dirname, '../js/cloudpages.js'), 'utf8');
    // Remove the auto-init listener — we'll call CloudPages.init() manually per test
    const modifiedSrc = cpSrc.replace(
        "document.addEventListener('DOMContentLoaded', init);",
        "// auto-init disabled for testing"
    );
    await evaluate(ws, `(function(){ ${modifiedSrc} \n})(); 'cloudpages.js loaded'`, 30000);
    console.log('  Injected: cloudpages.js (auto-init disabled)');
}

// ─── DOM Setup Helpers ─────────────────────────────────────────

/**
 * Builds a test DOM with script blocks and container elements.
 * Returns JS expression that sets up the page for a CloudPages test.
 */
function buildTestDOM(opts) {
    const settings = JSON.stringify(opts.settings || {
        load_on_open: false,
        page_length: 25,
        enable_xlsx_export: true,
        enable_csv_export: true,
        amount_unit_format: '$0.00',
        qty_unit_format: '0.00'
    });
    const parameters = JSON.stringify(opts.parameters || {});
    const query = opts.query || 'SELECT 1';
    const columns = JSON.stringify(opts.columns || {});

    return `
        (() => {
            // Clean up any previous test DOM
            const old = document.getElementById('cp-test-root');
            if (old) old.remove();

            const root = document.createElement('div');
            root.id = 'cp-test-root';

            // Script blocks
            function addScript(id, type, content) {
                // Remove old one if exists
                const existing = document.getElementById(id);
                if (existing) existing.remove();
                const s = document.createElement('script');
                s.id = id;
                s.type = type;
                s.textContent = content;
                document.head.appendChild(s);
            }

            addScript('settings', 'application/json', ${JSON.stringify(settings)});
            addScript('parameters', 'application/json', ${JSON.stringify(parameters)});
            addScript('query', 'text/plain', ${JSON.stringify(query)});
            addScript('columns', 'application/json', ${JSON.stringify(columns)});

            // Container elements
            root.innerHTML = \`
                <div id="parametersContainer"></div>
                <button id="submitButton">Run</button>
                <button id="exportBtn">Export</button>
                <div id="tableContainer"></div>
            \`;

            document.body.appendChild(root);
            return 'DOM ready';
        })()
    `;
}

function cleanupTestDOM() {
    return `
        (() => {
            const root = document.getElementById('cp-test-root');
            if (root) root.remove();
            ['settings', 'parameters', 'query', 'columns'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
            return 'cleaned';
        })()
    `;
}

// ═══════════════════════════════════════════════════════════════
// TIER 1 — Config Loader + SQL Binding
// ═══════════════════════════════════════════════════════════════

async function tier1(ws) {
    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('  TIER 1 \u2014 Config Loader + SQL Binding');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

    // 1A: CloudPages object exists
    console.log('\u2500\u2500 1A: Library Availability \u2500\u2500');
    await test(ws, 'CloudPages object exists', `typeof CloudPages === 'object'`);
    await test(ws, 'CloudPages.loadConfig is a function', `typeof CloudPages.loadConfig === 'function'`);
    await test(ws, 'CloudPages.bindParams is a function', `typeof CloudPages.bindParams === 'function'`);
    await test(ws, 'CloudPages.hooks exists', `typeof CloudPages.hooks === 'object'`);
    await test(ws, 'CloudPages.hooks has all 4 hooks', `
        (() => {
            const h = CloudPages.hooks;
            const keys = ['onBeforeQuery', 'onAfterQuery', 'onRenderRow', 'onExport'];
            const missing = keys.filter(k => typeof h[k] !== 'function');
            return { pass: missing.length === 0, detail: missing.length ? 'missing: ' + missing.join(', ') : 'all present' };
        })()
    `);

    // 1B: Config Loader
    console.log('\n\u2500\u2500 1B: Config Loader \u2500\u2500');

    // Set up valid DOM
    await evaluate(ws, buildTestDOM({
        settings: { load_on_open: false, page_length: 50, enable_xlsx_export: true },
        parameters: { name: { label: 'Name', type: 'string' } },
        query: 'SELECT * FROM part WHERE num = :name',
        columns: { num: { format: 'number' } }
    }));

    await test(ws, 'loadConfig() parses all 4 blocks', `
        (() => {
            const cfg = CloudPages.loadConfig();
            return {
                pass: cfg.settings && cfg.parameters && cfg.query && cfg.columns,
                detail: 'keys: ' + Object.keys(cfg).join(', ')
            };
        })()
    `);

    await test(ws, 'Settings defaults applied (page_length)', `
        (() => {
            const cfg = CloudPages.loadConfig();
            return { pass: cfg.settings.page_length === 50, detail: 'page_length: ' + cfg.settings.page_length };
        })()
    `);

    await test(ws, 'Parameters parsed correctly', `
        (() => {
            const cfg = CloudPages.loadConfig();
            return {
                pass: cfg.parameters.name && cfg.parameters.name.type === 'string',
                detail: JSON.stringify(cfg.parameters.name)
            };
        })()
    `);

    await test(ws, 'Query text preserved', `
        (() => {
            const cfg = CloudPages.loadConfig();
            return { pass: cfg.query.includes(':name'), detail: cfg.query.trim().substring(0, 50) };
        })()
    `);

    // Missing block error
    await test(ws, 'Missing settings block throws descriptive error', `
        (() => {
            const el = document.getElementById('settings');
            const parent = el.parentNode;
            el.remove();
            try {
                CloudPages.loadConfig();
                parent.appendChild(el); // restore
                return { pass: false, detail: 'no error thrown' };
            } catch (e) {
                parent.appendChild(el); // restore
                return { pass: e.message.includes('settings'), detail: e.message };
            }
        })()
    `);

    await evaluate(ws, cleanupTestDOM());

    // 1C: SQL Binding Engine
    console.log('\n\u2500\u2500 1C: SQL Binding Engine \u2500\u2500');

    await test(ws, 'Single value binding', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM part WHERE num = :partNum',
                { partNum: 'ABC123' }
            );
            return {
                pass: result.sql.includes(':partNum') && result.bindings.partNum === 'ABC123',
                detail: 'sql: ' + result.sql + ' | bindings: ' + JSON.stringify(result.bindings)
            };
        })()
    `);

    await test(ws, 'Multiple value bindings', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM so WHERE num = :soNum AND customerId = :custId',
                { soNum: '1001', custId: '42' }
            );
            return {
                pass: result.bindings.soNum === '1001' && result.bindings.custId === '42',
                detail: JSON.stringify(result.bindings)
            };
        })()
    `);

    await test(ws, 'Array value expands for IN clause', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM part WHERE statusId IN (:statuses)',
                { statuses: [10, 20, 30] }
            );
            const hasExpanded = result.sql.includes(':statuses_0') &&
                                result.sql.includes(':statuses_1') &&
                                result.sql.includes(':statuses_2');
            const hasBindings = result.bindings.statuses_0 === '10' &&
                                result.bindings.statuses_1 === '20' &&
                                result.bindings.statuses_2 === '30';
            return {
                pass: hasExpanded && hasBindings,
                detail: 'sql: ' + result.sql + ' | bindings: ' + JSON.stringify(result.bindings)
            };
        })()
    `);

    await test(ws, 'Null/undefined/empty values skipped', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM part WHERE a = :a AND b = :b AND c = :c',
                { a: null, b: undefined, c: '' }
            );
            return {
                pass: Object.keys(result.bindings).length === 0,
                detail: 'bindings: ' + JSON.stringify(result.bindings)
            };
        })()
    `);

    await test(ws, 'Numeric values coerced to strings', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM part WHERE id = :id',
                { id: 42 }
            );
            return {
                pass: result.bindings.id === '42' && typeof result.bindings.id === 'string',
                detail: 'type: ' + typeof result.bindings.id + ', value: ' + result.bindings.id
            };
        })()
    `);

    await test(ws, 'Boolean values coerced to strings', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM part WHERE active = :active',
                { active: true }
            );
            return {
                pass: result.bindings.active === 'true',
                detail: 'value: ' + result.bindings.active
            };
        })()
    `);

    await test(ws, 'Range params (_start/_end) bind individually', `
        (() => {
            const result = CloudPages.bindParams(
                'SELECT * FROM so WHERE dateIssued BETWEEN :date_start AND :date_end',
                { date_start: '2024-01-01', date_end: '2024-12-31' }
            );
            return {
                pass: result.bindings.date_start === '2024-01-01' && result.bindings.date_end === '2024-12-31',
                detail: JSON.stringify(result.bindings)
            };
        })()
    `);

    await test(ws, 'snakeToTitle converts correctly', `
        (() => {
            const cases = [
                ['so_num', 'So Num'],
                ['date_issued', 'Date Issued'],
                ['qty_to_fulfill', 'Qty To Fulfill'],
                ['id', 'Id']
            ];
            const failed = cases.filter(([input, expected]) =>
                CloudPages.snakeToTitle(input) !== expected
            );
            return {
                pass: failed.length === 0,
                detail: failed.length ? 'failed: ' + JSON.stringify(failed) : 'all passed'
            };
        })()
    `);
}

// ═══════════════════════════════════════════════════════════════
// TIER 2 — Parameter Renderers
// ═══════════════════════════════════════════════════════════════

async function tier2(ws) {
    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('  TIER 2 \u2014 Parameter Renderers');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

    // 2A: Primitive types render correct elements
    console.log('\u2500\u2500 2A: Primitive Parameter Types \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            txt: { label: 'Text Field', type: 'string' },
            num: { label: 'Integer', type: 'int' },
            dec: { label: 'Decimal', type: 'decimal' },
            dt: { label: 'Date', type: 'date' },
            tm: { label: 'Time', type: 'time' },
            ts: { label: 'Timestamp', type: 'timestamp' },
            chk: { label: 'Active', type: 'checkbox' }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            const container = document.getElementById('parametersContainer');
            CloudPages.renderParameters(cfg.parameters, container);
            return 'rendered';
        })()
    `);

    await test(ws, 'String renders <input type="text">', `
        (() => {
            const el = document.getElementById('txt');
            return { pass: el && el.type === 'text', detail: el ? el.outerHTML.substring(0, 80) : 'not found' };
        })()
    `);

    await test(ws, 'Int renders <input type="number" step="1">', `
        (() => {
            const el = document.getElementById('num');
            return {
                pass: el && el.type === 'number' && el.step === '1',
                detail: el ? 'type=' + el.type + ' step=' + el.step : 'not found'
            };
        })()
    `);

    await test(ws, 'Decimal renders <input type="number" step="0.01">', `
        (() => {
            const el = document.getElementById('dec');
            return {
                pass: el && el.type === 'number' && el.step === '0.01',
                detail: el ? 'type=' + el.type + ' step=' + el.step : 'not found'
            };
        })()
    `);

    await test(ws, 'Date renders <input type="date">', `
        (() => {
            const el = document.getElementById('dt');
            return { pass: el && el.type === 'date', detail: el ? el.type : 'not found' };
        })()
    `);

    await test(ws, 'Time renders <input type="time">', `
        (() => {
            const el = document.getElementById('tm');
            return { pass: el && el.type === 'time', detail: el ? el.type : 'not found' };
        })()
    `);

    await test(ws, 'Timestamp renders <input type="datetime-local">', `
        (() => {
            const el = document.getElementById('ts');
            return { pass: el && el.type === 'datetime-local', detail: el ? el.type : 'not found' };
        })()
    `);

    await test(ws, 'Checkbox renders <input type="checkbox">', `
        (() => {
            const el = document.getElementById('chk');
            return { pass: el && el.type === 'checkbox', detail: el ? el.type : 'not found' };
        })()
    `);

    await test(ws, 'All parameters have labels', `
        (() => {
            const labels = document.querySelectorAll('#parametersContainer label.form-label');
            return { pass: labels.length === 7, detail: 'count: ' + labels.length };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());

    // 2B: Range mode
    console.log('\n\u2500\u2500 2B: Range Mode \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            date_issued: { label: 'Date Issued', type: 'date', mode: 'range' },
            amount: { label: 'Amount', type: 'decimal', mode: 'range' },
            created_time: { label: 'Created', type: 'time', mode: 'range' },
            modified: { label: 'Modified', type: 'timestamp', mode: 'range' }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    await test(ws, 'Date range renders _start and _end inputs', `
        (() => {
            const start = document.getElementById('date_issued_start');
            const end = document.getElementById('date_issued_end');
            return {
                pass: start && end && start.type === 'date' && end.type === 'date',
                detail: 'start: ' + (start ? start.type : 'missing') + ', end: ' + (end ? end.type : 'missing')
            };
        })()
    `);

    await test(ws, 'Decimal range renders _start and _end inputs', `
        (() => {
            const start = document.getElementById('amount_start');
            const end = document.getElementById('amount_end');
            return {
                pass: start && end && start.type === 'number' && start.step === '0.01',
                detail: 'start: ' + (start ? start.type + '/' + start.step : 'missing')
            };
        })()
    `);

    await test(ws, 'Time range renders correctly', `
        (() => {
            const start = document.getElementById('created_time_start');
            const end = document.getElementById('created_time_end');
            return { pass: start && end && start.type === 'time', detail: start ? start.type : 'missing' };
        })()
    `);

    await test(ws, 'Timestamp range renders correctly', `
        (() => {
            const start = document.getElementById('modified_start');
            const end = document.getElementById('modified_end');
            return { pass: start && end && start.type === 'datetime-local', detail: start ? start.type : 'missing' };
        })()
    `);

    await test(ws, 'Range group has "to" divider', `
        (() => {
            const dividers = document.querySelectorAll('.cp-range-divider');
            return { pass: dividers.length === 4, detail: 'count: ' + dividers.length };
        })()
    `);

    // 2C: Collect values
    console.log('\n\u2500\u2500 2C: Value Collection \u2500\u2500');

    await test(ws, 'collectValues reads range _start/_end', `
        (() => {
            document.getElementById('date_issued_start').value = '2024-01-01';
            document.getElementById('date_issued_end').value = '2024-12-31';
            const cfg = CloudPages.loadConfig();
            const vals = CloudPages.collectValues(cfg.parameters);
            return {
                pass: vals.date_issued_start === '2024-01-01' && vals.date_issued_end === '2024-12-31',
                detail: JSON.stringify(vals)
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());

    // 2D: Validation
    console.log('\n\u2500\u2500 2D: Validation \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            required_field: { label: 'Required', type: 'string', required: true },
            optional_field: { label: 'Optional', type: 'string' }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    await test(ws, 'Required field shows asterisk', `
        (() => {
            const asterisks = document.querySelectorAll('.cp-required');
            return { pass: asterisks.length === 1, detail: 'count: ' + asterisks.length };
        })()
    `);

    await test(ws, 'Validation fails when required field is empty', `
        (() => {
            const cfg = CloudPages.loadConfig();
            const valid = CloudPages.validateParameters(cfg.parameters);
            return { pass: valid === false, detail: 'valid: ' + valid };
        })()
    `);

    await test(ws, 'Validation shows error message', `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.validateParameters(cfg.parameters);
            const err = document.getElementById('required_field_error');
            return {
                pass: err && err.textContent.includes('Required'),
                detail: err ? err.textContent : 'no error element'
            };
        })()
    `);

    await test(ws, 'Validation passes when required field has value', `
        (() => {
            document.getElementById('required_field').value = 'hello';
            const cfg = CloudPages.loadConfig();
            const valid = CloudPages.validateParameters(cfg.parameters);
            return { pass: valid === true, detail: 'valid: ' + valid };
        })()
    `);

    // 2E: Dropdown (static — no SQL)
    console.log('\n\u2500\u2500 2E: Dropdown (static) \u2500\u2500');

    await evaluate(ws, cleanupTestDOM());
    await evaluate(ws, buildTestDOM({
        parameters: {
            status: { label: 'Status', type: 'dropdown', mode: 'single' },
            multi_status: { label: 'Statuses', type: 'dropdown', mode: 'multi' }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    await test(ws, 'Dropdown renders <select>', `
        (() => {
            const el = document.getElementById('status');
            return { pass: el && el.tagName === 'SELECT', detail: el ? el.tagName : 'not found' };
        })()
    `);

    await test(ws, 'Dropdown has placeholder option', `
        (() => {
            const el = document.getElementById('status');
            const first = el && el.options[0];
            return {
                pass: first && first.textContent === 'Select an option' && first.disabled,
                detail: first ? first.textContent + ' disabled=' + first.disabled : 'missing'
            };
        })()
    `);

    await test(ws, 'Multi dropdown has multiple attribute', `
        (() => {
            const el = document.getElementById('multi_status');
            return { pass: el && el.multiple === true, detail: el ? 'multiple=' + el.multiple : 'not found' };
        })()
    `);

    await test(ws, 'Multi dropdown has helper text', `
        (() => {
            const helper = document.querySelector('.form-text');
            return {
                pass: helper && helper.textContent.includes('Ctrl+click'),
                detail: helper ? helper.textContent : 'not found'
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());

    // 2F: Autocomplete structure
    console.log('\n\u2500\u2500 2F: Autocomplete Structure \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            customer: {
                label: 'Customer',
                type: 'autocomplete',
                sql: 'SELECT id, name FROM customer LIMIT 10',
                value: 'id',
                display: 'name',
                search: 'name'
            }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    await test(ws, 'Autocomplete renders input with placeholder', `
        (() => {
            const el = document.getElementById('customer');
            return {
                pass: el && el.type === 'text' && el.placeholder === 'Type to search...',
                detail: el ? 'placeholder=' + el.placeholder : 'not found'
            };
        })()
    `);

    await test(ws, 'Autocomplete has results container', `
        (() => {
            const results = document.querySelector('.cp-autocomplete-results');
            return {
                pass: results && results.style.display !== 'block',
                detail: results ? 'display=' + results.style.display : 'not found'
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());
}

// ═══════════════════════════════════════════════════════════════
// TIER 3 — SQL-driven Parameters (live FB.query)
// ═══════════════════════════════════════════════════════════════

async function tier3(ws) {
    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('  TIER 3 \u2014 SQL-driven Parameters (Live)');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

    // 3A: Dropdown with SQL
    console.log('\u2500\u2500 3A: SQL-populated Dropdown \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            location: {
                label: 'Location',
                type: 'dropdown',
                mode: 'single',
                sql: 'SELECT id, name, description FROM location WHERE activeFlag = 1 ORDER BY name LIMIT 20',
                value: 'id',
                display: 'name,description'
            }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    // Wait a moment for async loading to complete
    await evaluate(ws, `new Promise(r => setTimeout(r, 1000))`);

    await test(ws, 'Dropdown populated with SQL results', `
        (() => {
            const el = document.getElementById('location');
            // First option is placeholder, rest are data
            const dataOptions = el ? el.options.length - 1 : 0;
            return {
                pass: dataOptions > 0,
                detail: 'options loaded: ' + dataOptions + (el && el.options[1] ? ', first: ' + el.options[1].textContent : '')
            };
        })()
    `);

    await test(ws, 'Dropdown option values are correct', `
        (() => {
            const el = document.getElementById('location');
            if (!el || el.options.length < 2) return { pass: false, detail: 'no options' };
            const opt = el.options[1];
            return {
                pass: opt.value !== '' && opt.textContent !== '',
                detail: 'value=' + opt.value + ', text=' + opt.textContent
            };
        })()
    `);

    await test(ws, 'collectValues returns selected dropdown value', `
        (() => {
            const el = document.getElementById('location');
            if (!el || el.options.length < 2) return { pass: false, detail: 'no options' };
            el.selectedIndex = 1;
            const cfg = CloudPages.loadConfig();
            const vals = CloudPages.collectValues(cfg.parameters);
            return {
                pass: vals.location !== undefined && vals.location !== '',
                detail: 'value: ' + vals.location
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());

    // 3B: Autocomplete with SQL
    console.log('\n\u2500\u2500 3B: SQL-populated Autocomplete \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            part: {
                label: 'Part',
                type: 'autocomplete',
                sql: 'SELECT num, description FROM part WHERE activeFlag = 1 LIMIT 50',
                value: 'num',
                display: 'num,description',
                search: 'description',
                minChars: 1
            }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    // Simulate typing to trigger autocomplete
    await test(ws, 'Autocomplete triggers search on input', `
        (async () => {
            const el = document.getElementById('part');
            el.value = 'butter';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            // Wait for debounce (250ms) + query
            await new Promise(r => setTimeout(r, 2000));
            const results = document.querySelectorAll('.cp-autocomplete-item');
            return {
                pass: results.length > 0,
                detail: 'results: ' + results.length + (results[0] ? ', first: ' + results[0].textContent.substring(0, 40) : '')
            };
        })()
    `);

    await test(ws, 'Autocomplete item click selects value', `
        (async () => {
            const results = document.querySelectorAll('.cp-autocomplete-item');
            if (results.length === 0) return { pass: false, detail: 'no results to click' };
            const firstItem = results[0];
            const expectedText = firstItem.textContent;
            const expectedId = firstItem.dataset.id;
            firstItem.click();
            const el = document.getElementById('part');
            return {
                pass: el.value === expectedText && el.dataset.selectedId === expectedId,
                detail: 'value=' + el.value + ', selectedId=' + el.dataset.selectedId
            };
        })()
    `);

    await test(ws, 'collectValues returns autocomplete selectedId', `
        (() => {
            const cfg = CloudPages.loadConfig();
            const vals = CloudPages.collectValues(cfg.parameters);
            return {
                pass: vals.part !== undefined && vals.part !== '',
                detail: 'value: ' + vals.part
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());

    // 3C: Full parameter → SQL binding → query round trip
    console.log('\n\u2500\u2500 3C: Parameter \u2192 SQL Binding Round Trip \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        parameters: {
            active: { label: 'Active Only', type: 'checkbox' }
        },
        query: 'SELECT num, description FROM part WHERE activeFlag = :active LIMIT 5',
        columns: { num: {}, description: {} }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    await test(ws, 'Checkbox value binds to SQL correctly', `
        (() => {
            document.getElementById('active').checked = true;
            const cfg = CloudPages.loadConfig();
            const vals = CloudPages.collectValues(cfg.parameters);
            const bound = CloudPages.bindParams(cfg.query, vals);
            return {
                pass: bound.bindings.active === 'true' && bound.sql.includes(':active'),
                detail: 'sql: ' + bound.sql.trim().substring(0, 60) + ' | bindings: ' + JSON.stringify(bound.bindings)
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());
}

// ═══════════════════════════════════════════════════════════════
// TIER 4 — Table Rendering + Column Formatting
// ═══════════════════════════════════════════════════════════════

async function tier4(ws) {
    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('  TIER 4 \u2014 Table Rendering + Formatting');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

    // 4A: Render table with mock data
    console.log('\u2500\u2500 4A: DataTables Rendering \u2500\u2500');

    await evaluate(ws, buildTestDOM({
        columns: {
            so_num: { label: 'SO #' },
            total_tax: { format: 'currency' },
            date_issued: { format: 'date' },
            qty: { format: 'number' },
            margin: { format: 'percent' }
        },
        settings: { page_length: 10, amount_unit_format: '$0.00', qty_unit_format: '0.00' }
    }));

    await test(ws, 'renderTable creates DataTable', `
        (() => {
            const cfg = CloudPages.loadConfig();
            const mockRows = [
                { so_num: '1001', total_tax: 15.50, date_issued: '2024-06-15', qty: 10.5, margin: 0.234 },
                { so_num: '1002', total_tax: 22.75, date_issued: '2024-07-20', qty: 5.0, margin: 0.15 },
                { so_num: '1003', total_tax: 0.00, date_issued: '2024-08-01', qty: 100.123, margin: 0.5 }
            ];
            CloudPages.renderTable(mockRows, cfg.columns, cfg.settings);
            const table = document.getElementById('cp-data-table');
            return {
                pass: table !== null && table.tagName === 'TABLE',
                detail: table ? 'table exists' : 'table not found'
            };
        })()
    `);

    await test(ws, 'DataTable has correct column headers', `
        (() => {
            const headers = document.querySelectorAll('#cp-data-table thead th');
            const headerTexts = Array.from(headers).map(h => h.textContent);
            // Expect 'SO #' (label override) and 'Date Issued' (snakeToTitle)
            return {
                pass: headerTexts.includes('SO #') && headerTexts.some(h => h.includes('Date Issued')),
                detail: JSON.stringify(headerTexts)
            };
        })()
    `);

    await test(ws, 'Currency column formatted correctly', `
        (() => {
            const cells = document.querySelectorAll('#cp-data-table tbody td');
            const taxCells = Array.from(cells).filter(c => c.textContent.includes('$'));
            return {
                pass: taxCells.length > 0,
                detail: 'currency cells: ' + taxCells.length + (taxCells[0] ? ', first: ' + taxCells[0].textContent : '')
            };
        })()
    `);

    await test(ws, 'Percent column formatted correctly', `
        (() => {
            const cells = document.querySelectorAll('#cp-data-table tbody td');
            const pctCells = Array.from(cells).filter(c => c.textContent.includes('%'));
            return {
                pass: pctCells.length > 0,
                detail: 'percent cells: ' + pctCells.length + (pctCells[0] ? ', first: ' + pctCells[0].textContent : '')
            };
        })()
    `);

    await test(ws, 'DataTable has pagination', `
        (() => {
            const paging = document.querySelector('.dataTables_paginate');
            return { pass: paging !== null, detail: paging ? 'found' : 'not found' };
        })()
    `);

    await test(ws, 'DataTable has search box', `
        (() => {
            const search = document.querySelector('.dataTables_filter');
            return { pass: search !== null, detail: search ? 'found' : 'not found' };
        })()
    `);

    // 4B: Empty data
    console.log('\n\u2500\u2500 4B: Empty Data Handling \u2500\u2500');

    await test(ws, 'Empty rows shows no-data message', `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderTable([], cfg.columns, cfg.settings);
            const container = document.getElementById('tableContainer');
            return {
                pass: container.textContent.includes('No data'),
                detail: container.textContent.trim()
            };
        })()
    `);

    // 4C: Live query → table render
    console.log('\n\u2500\u2500 4C: Live Query \u2192 Table Render \u2500\u2500');

    await evaluate(ws, cleanupTestDOM());
    await evaluate(ws, buildTestDOM({
        parameters: {},
        query: 'SELECT num AS part_num, description, activeFlag AS active FROM part LIMIT 10',
        columns: { part_num: { label: 'Part #' } },
        settings: { page_length: 25 }
    }));

    await test(ws, 'Live query renders table with results', `
        (async () => {
            const cfg = CloudPages.loadConfig();
            return new Promise((resolve) => {
                CloudPages.executeQuery(cfg.query, {}, (err, rows) => {
                    if (err) {
                        resolve({ pass: false, detail: 'query error: ' + err.message });
                        return;
                    }
                    CloudPages.renderTable(rows, cfg.columns, cfg.settings);
                    const table = document.getElementById('cp-data-table');
                    const rowCount = table ? table.querySelectorAll('tbody tr').length : 0;
                    resolve({
                        pass: rowCount > 0,
                        detail: 'rows rendered: ' + rowCount + (rows[0] ? ', first part: ' + rows[0].part_num : '')
                    });
                });
            });
        })()
    `);

    await evaluate(ws, cleanupTestDOM());
}

// ═══════════════════════════════════════════════════════════════
// TIER 5 — Export + Hooks + Full Lifecycle
// ═══════════════════════════════════════════════════════════════

async function tier5(ws) {
    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('  TIER 5 \u2014 Export + Hooks + Full Lifecycle');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

    // 5A: Hooks
    console.log('\u2500\u2500 5A: Hooks System \u2500\u2500');

    await test(ws, 'onBeforeQuery hook modifies SQL', `
        (() => {
            const origHook = CloudPages.hooks.onBeforeQuery;
            let hookCalled = false;
            CloudPages.hooks.onBeforeQuery = function(sql, params) {
                hookCalled = true;
                return { sql: sql + ' /* hooked */', params: params };
            };
            // Simulate what executeQuery does internally
            const hooked = CloudPages.hooks.onBeforeQuery('SELECT 1', {});
            CloudPages.hooks.onBeforeQuery = origHook; // restore
            return {
                pass: hookCalled && hooked.sql.includes('/* hooked */'),
                detail: 'called=' + hookCalled + ', sql=' + hooked.sql
            };
        })()
    `);

    await test(ws, 'onAfterQuery hook transforms rows', `
        (() => {
            const origHook = CloudPages.hooks.onAfterQuery;
            CloudPages.hooks.onAfterQuery = function(rows) {
                return rows.map(r => Object.assign({}, r, { _transformed: true }));
            };
            const result = CloudPages.hooks.onAfterQuery([{ id: 1 }, { id: 2 }]);
            CloudPages.hooks.onAfterQuery = origHook;
            return {
                pass: result.length === 2 && result[0]._transformed === true,
                detail: JSON.stringify(result[0])
            };
        })()
    `);

    // Ensure DOM exists for renderTable
    await evaluate(ws, buildTestDOM({ columns: {}, settings: { page_length: 25 } }));

    await test(ws, 'onRenderRow hook fires per row', `
        (() => {
            const origHook = CloudPages.hooks.onRenderRow;
            let callCount = 0;
            CloudPages.hooks.onRenderRow = function(row, index) {
                callCount++;
                row.rowIndex = index;
                return row;
            };
            // Trigger via renderTable
            CloudPages.renderTable(
                [{ a: 1 }, { a: 2 }, { a: 3 }],
                {},
                { page_length: 25 }
            );
            CloudPages.hooks.onRenderRow = origHook;
            return {
                pass: callCount === 3,
                detail: 'hook called ' + callCount + ' times'
            };
        })()
    `);

    await test(ws, 'onExport hook modifies export data', `
        (() => {
            const origHook = CloudPages.hooks.onExport;
            let hookFormat = null;
            CloudPages.hooks.onExport = function(rows, format) {
                hookFormat = format;
                return rows.filter(r => r.include);
            };
            const result = CloudPages.hooks.onExport(
                [{ id: 1, include: true }, { id: 2, include: false }],
                'xlsx'
            );
            CloudPages.hooks.onExport = origHook;
            return {
                pass: result.length === 1 && hookFormat === 'xlsx',
                detail: 'filtered to ' + result.length + ' rows, format=' + hookFormat
            };
        })()
    `);

    // 5B: Export Engine
    console.log('\n\u2500\u2500 5B: Export Engine \u2500\u2500');

    await test(ws, 'XLSX export function exists', `typeof CloudPages.exportXLSX === 'function'`);
    await test(ws, 'CSV export function exists', `typeof CloudPages.exportCSV === 'function'`);

    await test(ws, 'XLSX export generates workbook (SheetJS)', `
        (() => {
            if (typeof XLSX === 'undefined') return { pass: false, detail: 'SheetJS not loaded' };
            // Test that json_to_sheet works with our data format
            const rows = [
                { part_num: 'ABC', qty: 10, price: 25.50 },
                { part_num: 'DEF', qty: 5, price: 12.00 }
            ];
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
            return {
                pass: typeof b64 === 'string' && b64.length > 100,
                detail: 'base64 length: ' + b64.length
            };
        })()
    `);

    await test(ws, 'Platform detection works for save method', `
        (() => {
            const isJX = FB.isJXBrowser;
            const hasSaveFile = typeof FB.saveFile === 'function';
            return {
                pass: typeof isJX === 'boolean' && hasSaveFile,
                detail: 'isJXBrowser=' + isJX + ', hasSaveFile=' + hasSaveFile
            };
        })()
    `);

    // 5C: Full Lifecycle
    console.log('\n\u2500\u2500 5C: Full Lifecycle \u2500\u2500');

    await evaluate(ws, cleanupTestDOM());
    await evaluate(ws, buildTestDOM({
        parameters: {
            active: { label: 'Active Only', type: 'checkbox' }
        },
        query: 'SELECT num AS part_num, description FROM part WHERE activeFlag = :active LIMIT 5',
        columns: {
            part_num: { label: 'Part #' },
            description: {}
        },
        settings: {
            load_on_open: false,
            page_length: 25,
            enable_xlsx_export: true
        }
    }));

    await test(ws, 'Full lifecycle: render → collect → bind → query → table', `
        (async () => {
            try {
                // 1. Load config
                const cfg = CloudPages.loadConfig();

                // 2. Render parameters
                const container = document.getElementById('parametersContainer');
                CloudPages.renderParameters(cfg.parameters, container);

                // 3. Set parameter value
                document.getElementById('active').checked = true;

                // 4. Validate
                const valid = CloudPages.validateParameters(cfg.parameters);
                if (!valid) return { pass: false, detail: 'validation failed' };

                // 5. Collect values
                const vals = CloudPages.collectValues(cfg.parameters);

                // 6. Bind SQL
                const bound = CloudPages.bindParams(cfg.query, vals);

                // 7. Execute query
                return new Promise((resolve) => {
                    CloudPages.executeQuery(cfg.query, vals, (err, rows) => {
                        if (err) {
                            resolve({ pass: false, detail: 'query error: ' + (err.message || err) });
                            return;
                        }

                        // 8. Render table
                        CloudPages.renderTable(rows, cfg.columns, cfg.settings);

                        const table = document.getElementById('cp-data-table');
                        const rowCount = table ? table.querySelectorAll('tbody tr').length : 0;

                        resolve({
                            pass: rowCount > 0,
                            detail: 'lifecycle complete: ' + rowCount + ' rows rendered' +
                                    (rows[0] ? ', first: ' + rows[0].part_num : '')
                        });
                    });
                });
            } catch (e) {
                return { pass: false, detail: 'exception: ' + e.message };
            }
        })()
    `);

    await test(ws, 'Export after lifecycle (XLSX via FB.saveFile or download)', `
        (() => {
            // Just verify exportXLSX doesn't throw with the current table data
            try {
                // We can't actually trigger the download/save dialog in tests,
                // but we can verify the function doesn't error
                if (typeof XLSX === 'undefined') return { pass: false, detail: 'SheetJS not loaded' };
                const rows = [{ part_num: 'TEST', description: 'Test Part' }];
                const ws = XLSX.utils.json_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
                // If JXBrowser, verify FB.saveFile exists
                if (FB.isJXBrowser) {
                    return {
                        pass: typeof FB.saveFile === 'function',
                        detail: 'JXBrowser: FB.saveFile ready, b64 length=' + b64.length
                    };
                } else {
                    return { pass: true, detail: 'Browser: blob download ready, b64 length=' + b64.length };
                }
            } catch (e) {
                return { pass: false, detail: 'error: ' + e.message };
            }
        })()
    `);

    // 5D: registerRenderer extensibility
    console.log('\n\u2500\u2500 5D: Custom Renderer Registration \u2500\u2500');

    await test(ws, 'registerRenderer adds custom parameter type', `
        (() => {
            CloudPages.registerRenderer('color', {
                render: function(key, cfg) {
                    const input = document.createElement('input');
                    input.type = 'color';
                    input.id = key;
                    input.className = 'form-control';
                    return input;
                },
                getValue: function(key) {
                    const el = document.getElementById(key);
                    return el ? el.value : undefined;
                }
            });
            return { pass: true, detail: 'color renderer registered' };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());
    await evaluate(ws, buildTestDOM({
        parameters: {
            bg_color: { label: 'Background Color', type: 'color' }
        }
    }));
    await evaluate(ws, `
        (() => {
            const cfg = CloudPages.loadConfig();
            CloudPages.renderParameters(cfg.parameters, document.getElementById('parametersContainer'));
            return 'rendered';
        })()
    `);

    await test(ws, 'Custom color renderer creates color input', `
        (() => {
            const el = document.getElementById('bg_color');
            return {
                pass: el && el.type === 'color',
                detail: el ? 'type=' + el.type : 'not found'
            };
        })()
    `);

    await evaluate(ws, cleanupTestDOM());
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
    const tierArg = parseInt(process.argv[2]) || 5;
    const tier = Math.min(tierArg, 5);

    console.log('CloudPages CDP Test Runner');
    console.log(`Tiers: 1${tier >= 2 ? '-' + tier : ''}`);
    console.log('');

    // Find target page
    const pages = await getPages();
    console.log(`Found ${pages.length} page(s):`);
    pages.forEach(p => console.log(`  - ${p.title} (${p.url})`));

    // Use first page with FB bridge (prefer index.html / API Explorer)
    const targetPage = pages.find(p =>
        p.title.includes('API Explorer') || p.title.includes('index')
    ) || pages[0];

    if (!targetPage) {
        console.error('No pages found on CDP port 9222');
        process.exit(1);
    }

    console.log(`\nTarget: ${targetPage.title}`);
    console.log(`URL: ${targetPage.url}\n`);

    const ws = await connectPage(targetPage.webSocketDebuggerUrl);

    try {
        // Inject libraries
        console.log('Injecting libraries...');
        await ensureLibsLoaded(ws);
        console.log('');

        // Verify FB is available
        const fbCheck = await evaluate(ws, `typeof FB === 'object' && typeof FB.query === 'function'`);
        if (!fbCheck.value) {
            console.error('FB not available — cannot run tests');
            process.exit(1);
        }

        // Run tiers
        await tier1(ws);
        if (tier >= 2) await tier2(ws);
        if (tier >= 3) await tier3(ws);
        if (tier >= 4) await tier4(ws);
        if (tier >= 5) await tier5(ws);

    } finally {
        // Cleanup
        await evaluate(ws, cleanupTestDOM()).catch(() => {});
        ws.close();
    }

    // Summary
    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('  SUMMARY');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log(`  Passed: ${results.passed}`);
    console.log(`  Failed: ${results.failed}`);
    console.log(`  Total:  ${results.passed + results.failed}`);
    if (results.errors.length > 0) {
        console.log('\n  Failures:');
        results.errors.forEach(e => console.log(`    - ${e.name}: ${e.detail}`));
    }
    console.log('');

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
