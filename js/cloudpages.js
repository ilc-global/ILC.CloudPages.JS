/**
 * cloudpages.js — ILC CloudPages Declarative Report Engine
 *
 * Reads JSON config from <script> tags and handles the full lifecycle:
 * parameters → SQL → table → export.
 *
 * Dependencies: fb.js (loaded first), jQuery, DataTables, SheetJS (XLSX)
 *
 * @version 2.0.0
 * @license Source-Available (ILC Technology LLC)
 */
(function (window, $) {
    'use strict';

    var CloudPages = {};

    // ═══════════════════════════════════════════════════════════════════
    // [1] Hooks
    // ═══════════════════════════════════════════════════════════════════

    CloudPages.hooks = {
        onBeforeQuery: function (sql, params) { return { sql: sql, params: params }; },
        onAfterQuery: function (rows) { return rows; },
        onRenderRow: function (row, index) { return row; },
        onExport: function (rows, format) { return rows; }
    };

    // ═══════════════════════════════════════════════════════════════════
    // [2] Config Loader
    // ═══════════════════════════════════════════════════════════════════

    var _config = null;
    var _dataTableInstance = null;
    var _lastResultRows = [];

    function readScriptBlock(id, json) {
        var el = document.getElementById(id);
        if (!el) throw new Error('CloudPages: missing <script id="' + id + '"> block.');
        var text = el.textContent.trim();
        if (!text) throw new Error('CloudPages: <script id="' + id + '"> is empty.');
        if (json) {
            try { return JSON.parse(text); }
            catch (e) { throw new Error('CloudPages: <script id="' + id + '"> has invalid JSON: ' + e.message); }
        }
        return text;
    }

    function loadConfig() {
        var settings = readScriptBlock('settings', true);
        var parameters = readScriptBlock('parameters', true);
        var query = readScriptBlock('query', false);
        var columns = readScriptBlock('columns', true);

        // Apply defaults
        settings.load_on_open = settings.load_on_open || false;
        settings.page_length = settings.page_length || 25;
        settings.enable_xlsx_export = settings.enable_xlsx_export !== false;
        settings.enable_csv_export = settings.enable_csv_export !== false;

        _config = { settings: settings, parameters: parameters, query: query, columns: columns };
        return _config;
    }

    CloudPages.loadConfig = loadConfig;

    // ═══════════════════════════════════════════════════════════════════
    // [3] SQL Binding Engine
    // ═══════════════════════════════════════════════════════════════════

    function bindParams(sql, values) {
        var bindings = {};

        Object.keys(values).forEach(function (key) {
            var val = values[key];
            if (val === undefined || val === null || val === '') return;

            if (Array.isArray(val)) {
                // Multi-value IN clause expansion
                var placeholders = [];
                val.forEach(function (v, i) {
                    var expandedKey = key + '_' + i;
                    placeholders.push(':' + expandedKey);
                    bindings[expandedKey] = String(v);
                });
                // Replace :key with expanded list
                sql = sql.replace(new RegExp(':' + key + '\\b', 'g'), placeholders.join(', '));
            } else {
                bindings[key] = String(val);
            }
        });

        return { sql: sql, bindings: bindings };
    }

    CloudPages.bindParams = bindParams;

    // ═══════════════════════════════════════════════════════════════════
    // [4] Parameter Renderers
    // ═══════════════════════════════════════════════════════════════════

    var paramRenderers = {};

    function registerRenderer(type, renderer) {
        paramRenderers[type] = renderer;
    }

    function snakeToTitle(str) {
        return str.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    // --- String ---
    registerRenderer('string', {
        render: function (key, cfg) {
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control';
            input.id = key;
            if (cfg.default) input.value = cfg.default;
            return input;
        },
        getValue: function (key) {
            var el = document.getElementById(key);
            return el ? el.value : undefined;
        }
    });

    // --- Int ---
    registerRenderer('int', {
        render: function (key, cfg) {
            if (cfg.mode === 'range') return renderRangeInput(key, 'number', { step: '1' });
            var input = document.createElement('input');
            input.type = 'number';
            input.step = '1';
            input.className = 'form-control';
            input.id = key;
            if (cfg.default) input.value = cfg.default;
            return input;
        },
        getValue: function (key, cfg) {
            if (cfg && cfg.mode === 'range') return getRangeValue(key);
            var el = document.getElementById(key);
            return el ? el.value : undefined;
        }
    });

    // --- Decimal ---
    registerRenderer('decimal', {
        render: function (key, cfg) {
            if (cfg.mode === 'range') return renderRangeInput(key, 'number', { step: '0.01' });
            var input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.className = 'form-control';
            input.id = key;
            if (cfg.default) input.value = cfg.default;
            return input;
        },
        getValue: function (key, cfg) {
            if (cfg && cfg.mode === 'range') return getRangeValue(key);
            var el = document.getElementById(key);
            return el ? el.value : undefined;
        }
    });

    // --- Date ---
    registerRenderer('date', {
        render: function (key, cfg) {
            if (cfg.mode === 'range') return renderRangeInput(key, 'date');
            var input = document.createElement('input');
            input.type = 'date';
            input.className = 'form-control';
            input.id = key;
            if (cfg.default) input.value = cfg.default;
            return input;
        },
        getValue: function (key, cfg) {
            if (cfg && cfg.mode === 'range') return getRangeValue(key);
            var el = document.getElementById(key);
            return el ? el.value : undefined;
        }
    });

    // --- Time ---
    registerRenderer('time', {
        render: function (key, cfg) {
            if (cfg.mode === 'range') return renderRangeInput(key, 'time');
            var input = document.createElement('input');
            input.type = 'time';
            input.className = 'form-control';
            input.id = key;
            if (cfg.default) input.value = cfg.default;
            return input;
        },
        getValue: function (key, cfg) {
            if (cfg && cfg.mode === 'range') return getRangeValue(key);
            var el = document.getElementById(key);
            return el ? el.value : undefined;
        }
    });

    // --- Timestamp ---
    registerRenderer('timestamp', {
        render: function (key, cfg) {
            if (cfg.mode === 'range') return renderRangeInput(key, 'datetime-local');
            var input = document.createElement('input');
            input.type = 'datetime-local';
            input.className = 'form-control';
            input.id = key;
            if (cfg.default) input.value = cfg.default;
            return input;
        },
        getValue: function (key, cfg) {
            if (cfg && cfg.mode === 'range') return getRangeValue(key);
            var el = document.getElementById(key);
            return el ? el.value : undefined;
        }
    });

    // --- Checkbox ---
    registerRenderer('checkbox', {
        render: function (key, cfg) {
            var wrapper = document.createElement('div');
            wrapper.className = 'form-check';
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-check-input';
            input.id = key;
            if (cfg.default) input.checked = true;
            wrapper.appendChild(input);
            return wrapper;
        },
        getValue: function (key) {
            var el = document.getElementById(key);
            return el ? el.checked : false;
        }
    });

    // --- Dropdown ---
    registerRenderer('dropdown', {
        render: function (key, cfg) {
            var select = document.createElement('select');
            select.className = 'form-select';
            select.id = key;
            if (cfg.mode === 'multi') select.multiple = true;

            // Default placeholder option
            var placeholder = document.createElement('option');
            placeholder.textContent = 'Select an option';
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.selected = true;
            select.appendChild(placeholder);

            // Load options from SQL if provided
            if (cfg.sql) {
                loadDropdownOptions(select, cfg);
            }

            if (cfg.mode === 'multi') {
                var helper = document.createElement('small');
                helper.className = 'form-text text-muted';
                helper.textContent = 'Ctrl+click to multi-select';
                var container = document.createElement('div');
                container.appendChild(select);
                container.appendChild(helper);
                return container;
            }

            return select;
        },
        getValue: function (key, cfg) {
            var el = document.getElementById(key);
            if (!el) return undefined;
            if (cfg && cfg.mode === 'multi') {
                return Array.from(el.selectedOptions)
                    .map(function (o) { return o.value; })
                    .filter(function (v) { return v !== ''; });
            }
            return el.value !== '' ? el.value : undefined;
        }
    });

    function loadDropdownOptions(select, cfg) {
        try {
            var rows = FB.query(cfg.sql);
            populateDropdownFromRows(select, rows, cfg);
        } catch (e) {
            // Fall back to async
            FB.queryAsync(cfg.sql).then(function (rows) {
                populateDropdownFromRows(select, rows, cfg);
            }).catch(function (err) {
                console.error('CloudPages: failed to load dropdown options:', err);
            });
        }
    }

    function populateDropdownFromRows(select, rows, cfg) {
        if (!rows || !rows.length) return;
        var displayFields = cfg.display ? cfg.display.split(',') : null;
        rows.forEach(function (row) {
            var opt = document.createElement('option');
            opt.value = row[cfg.value] || '';
            if (displayFields) {
                opt.textContent = displayFields.map(function (f) { return row[f.trim()]; }).join(', ');
            } else {
                opt.textContent = row[cfg.value] || '';
            }
            select.appendChild(opt);
        });
    }

    // --- Autocomplete ---
    registerRenderer('autocomplete', {
        render: function (key, cfg) {
            var container = document.createElement('div');
            container.className = 'cp-autocomplete-container';

            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control';
            input.id = key;
            input.placeholder = 'Type to search...';
            container.appendChild(input);

            var results = document.createElement('div');
            results.className = 'cp-autocomplete-results';
            container.appendChild(results);

            var selectedIndex = -1;
            var debounceTimer = null;

            input.addEventListener('input', function () {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function () {
                    var query = input.value.trim();
                    if (query.length < (cfg.minChars || 1)) {
                        results.innerHTML = '';
                        results.style.display = 'none';
                        return;
                    }
                    searchAutocomplete(input, results, cfg, query);
                    selectedIndex = -1;
                }, 250);
            });

            input.addEventListener('keydown', function (e) {
                var items = results.querySelectorAll('.cp-autocomplete-item');
                if (!items.length) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex + 1) % items.length;
                    highlightItem(items, selectedIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                    highlightItem(items, selectedIndex);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedIndex >= 0 && items[selectedIndex]) {
                        selectAutocompleteItem(input, results, items[selectedIndex]);
                    }
                } else if (e.key === 'Escape') {
                    results.innerHTML = '';
                    results.style.display = 'none';
                    selectedIndex = -1;
                }
            });

            // Close on outside click
            document.addEventListener('click', function (e) {
                if (!container.contains(e.target)) {
                    results.innerHTML = '';
                    results.style.display = 'none';
                }
            });

            return container;
        },
        getValue: function (key) {
            var el = document.getElementById(key);
            return el ? (el.dataset.selectedId || el.value || undefined) : undefined;
        }
    });

    function searchAutocomplete(input, resultsEl, cfg, query) {
        var displayFields = cfg.display ? cfg.display.split(',') : null;
        var searchField = cfg.search || (cfg.value || '');

        function renderResults(rows) {
            resultsEl.innerHTML = '';
            var filtered = rows.filter(function (row) {
                var val = row[searchField] || '';
                return String(val).toLowerCase().indexOf(query.toLowerCase()) >= 0;
            });

            if (!filtered.length) {
                var noRes = document.createElement('div');
                noRes.className = 'cp-autocomplete-no-results';
                noRes.textContent = 'No results found.';
                resultsEl.appendChild(noRes);
                resultsEl.style.display = 'block';
                return;
            }

            filtered.forEach(function (row) {
                var item = document.createElement('div');
                item.className = 'cp-autocomplete-item';
                if (displayFields) {
                    item.textContent = displayFields.map(function (f) { return row[f.trim()]; }).join(', ');
                } else {
                    item.textContent = row[searchField] || '';
                }
                item.dataset.id = row[cfg.value] || '';
                item.addEventListener('click', function () {
                    selectAutocompleteItem(input, resultsEl, item);
                });
                resultsEl.appendChild(item);
            });
            resultsEl.style.display = 'block';
        }

        try {
            var rows = FB.query(cfg.sql);
            renderResults(rows);
        } catch (e) {
            FB.queryAsync(cfg.sql).then(renderResults).catch(function (err) {
                console.error('CloudPages: autocomplete query failed:', err);
            });
        }
    }

    function selectAutocompleteItem(input, resultsEl, item) {
        input.value = item.textContent;
        input.dataset.selectedId = item.dataset.id;
        resultsEl.innerHTML = '';
        resultsEl.style.display = 'none';
    }

    function highlightItem(items, index) {
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('cp-autocomplete-highlight', i === index);
        }
    }

    // --- Range input helper ---
    function renderRangeInput(key, type, attrs) {
        var group = document.createElement('div');
        group.className = 'cp-range-group';

        var start = document.createElement('input');
        start.type = type;
        start.className = 'form-control';
        start.id = key + '_start';
        if (attrs) Object.keys(attrs).forEach(function (a) { start.setAttribute(a, attrs[a]); });

        var divider = document.createElement('span');
        divider.className = 'cp-range-divider';
        divider.textContent = 'to';

        var end = document.createElement('input');
        end.type = type;
        end.className = 'form-control';
        end.id = key + '_end';
        if (attrs) Object.keys(attrs).forEach(function (a) { end.setAttribute(a, attrs[a]); });

        group.appendChild(start);
        group.appendChild(divider);
        group.appendChild(end);
        return group;
    }

    function getRangeValue(key) {
        var startEl = document.getElementById(key + '_start');
        var endEl = document.getElementById(key + '_end');
        return {
            _start: startEl ? startEl.value : '',
            _end: endEl ? endEl.value : ''
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // [5] Parameter Form
    // ═══════════════════════════════════════════════════════════════════

    function renderParameters(parameters, container) {
        container.innerHTML = '';

        Object.keys(parameters).forEach(function (key) {
            var cfg = parameters[key];
            var renderer = paramRenderers[cfg.type] || paramRenderers['string'];

            var formGroup = document.createElement('div');
            formGroup.className = 'mb-3';

            var label = document.createElement('label');
            label.className = 'form-label';
            label.setAttribute('for', key);
            label.textContent = cfg.label || snakeToTitle(key);
            if (cfg.required) {
                var asterisk = document.createElement('span');
                asterisk.className = 'cp-required';
                asterisk.textContent = ' *';
                label.appendChild(asterisk);
            }
            formGroup.appendChild(label);

            var inputEl = renderer.render(key, cfg);
            formGroup.appendChild(inputEl);

            // Error slot
            var errorEl = document.createElement('div');
            errorEl.className = 'invalid-feedback';
            errorEl.id = key + '_error';
            formGroup.appendChild(errorEl);

            container.appendChild(formGroup);
        });
    }

    function collectValues(parameters) {
        var values = {};
        Object.keys(parameters).forEach(function (key) {
            var cfg = parameters[key];
            var renderer = paramRenderers[cfg.type] || paramRenderers['string'];
            var val = renderer.getValue(key, cfg);

            if (cfg.mode === 'range' && val && typeof val === 'object' && '_start' in val) {
                values[key + '_start'] = val._start;
                values[key + '_end'] = val._end;
            } else {
                values[key] = val;
            }
        });
        return values;
    }

    function validateParameters(parameters) {
        var valid = true;
        Object.keys(parameters).forEach(function (key) {
            var cfg = parameters[key];
            var errorEl = document.getElementById(key + '_error');
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }

            if (!cfg.required) return;

            var renderer = paramRenderers[cfg.type] || paramRenderers['string'];
            var val = renderer.getValue(key, cfg);

            var empty = false;
            if (cfg.mode === 'range' && val && typeof val === 'object') {
                empty = !val._start && !val._end;
            } else if (Array.isArray(val)) {
                empty = val.length === 0;
            } else {
                empty = !val && val !== false && val !== 0;
            }

            if (empty) {
                valid = false;
                if (errorEl) {
                    errorEl.textContent = (cfg.label || snakeToTitle(key)) + ' is required.';
                    errorEl.style.display = 'block';
                }
            }
        });
        return valid;
    }

    // ═══════════════════════════════════════════════════════════════════
    // [6] Table Renderer (DataTables)
    // ═══════════════════════════════════════════════════════════════════

    function formatCurrency(val, format) {
        var num = parseFloat(val);
        if (isNaN(num)) return val;
        var decimals = 2;
        if (format) {
            var match = format.match(/0\.(0+)/);
            if (match) decimals = match[1].length;
        }
        return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function formatNumber(val, format) {
        var num = parseFloat(val);
        if (isNaN(num)) return val;
        var decimals = 2;
        if (format) {
            var match = format.match(/0\.(0+)/);
            if (match) decimals = match[1].length;
        }
        return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }

    function formatPercent(val) {
        var num = parseFloat(val);
        if (isNaN(num)) return val;
        return (num * 100).toFixed(2) + '%';
    }

    function formatDate(val) {
        if (!val) return '';
        var d = new Date(val);
        return isNaN(d.getTime()) ? val : d.toLocaleDateString();
    }

    function columnRenderFn(colCfg, settings) {
        var fmt = colCfg ? colCfg.format : null;
        if (!fmt) return null;

        return function (data) {
            switch (fmt) {
                case 'currency': return formatCurrency(data, settings.amount_unit_format);
                case 'date': return formatDate(data);
                case 'number': return formatNumber(data, settings.qty_unit_format);
                case 'percent': return formatPercent(data);
                default: return data;
            }
        };
    }

    function renderTable(rows, columns, settings) {
        var container = document.getElementById('tableContainer');
        if (!container) return;

        // Destroy existing DataTable
        if (_dataTableInstance) {
            _dataTableInstance.destroy();
            _dataTableInstance = null;
        }
        container.innerHTML = '';

        if (!rows || !rows.length) {
            container.innerHTML = '<p class="text-muted">No data available.</p>';
            return;
        }

        // Apply onRenderRow hook
        rows = rows.map(function (row, i) {
            return CloudPages.hooks.onRenderRow(row, i);
        }).filter(Boolean);

        _lastResultRows = rows;

        // Build column definitions from result keys
        var allKeys = Object.keys(rows[0]);
        var dtColumns = allKeys.map(function (key) {
            var colCfg = columns[key] || {};
            var def = {
                data: key,
                title: colCfg.label || snakeToTitle(key),
                visible: colCfg.visible !== false
            };
            if (colCfg.width) def.width = colCfg.width;
            var renderFn = columnRenderFn(colCfg, settings);
            if (renderFn) def.render = function (data) { return renderFn(data); };
            return def;
        });

        // Create table element
        var table = document.createElement('table');
        table.id = 'cp-data-table';
        table.className = 'table table-striped table-hover';
        container.appendChild(table);

        // Initialize DataTable
        _dataTableInstance = $(table).DataTable({
            data: rows,
            columns: dtColumns,
            pageLength: settings.page_length || 25,
            order: [],
            autoWidth: true,
            responsive: true
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // [7] Export Engine
    // ═══════════════════════════════════════════════════════════════════

    function exportXLSX(rows, filename) {
        if (typeof XLSX === 'undefined') {
            console.error('CloudPages: SheetJS (XLSX) not loaded.');
            return;
        }
        var data = CloudPages.hooks.onExport(rows, 'xlsx');
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

        if (FB.isJXBrowser) {
            var b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
            FB.saveFile('Save Report', 'xlsx', 'Excel Files', b64, filename + '.xlsx', true);
        } else {
            XLSX.writeFile(wb, filename + '.xlsx');
        }
    }

    function exportCSV(rows, filename) {
        var data = CloudPages.hooks.onExport(rows, 'csv');
        if (!data || !data.length) return;

        var keys = Object.keys(data[0]);
        var lines = [];
        lines.push(keys.map(csvEscape).join(','));
        data.forEach(function (row) {
            lines.push(keys.map(function (k) { return csvEscape(row[k]); }).join(','));
        });
        var csvStr = lines.join('\r\n');

        if (FB.isJXBrowser) {
            var b64 = btoa(unescape(encodeURIComponent(csvStr)));
            FB.saveFile('Save Report', 'csv', 'CSV Files', b64, filename + '.csv', true);
        } else {
            var blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    function csvEscape(val) {
        if (val === null || val === undefined) return '';
        var s = String(val);
        if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    // ═══════════════════════════════════════════════════════════════════
    // [8] Query Execution
    // ═══════════════════════════════════════════════════════════════════

    function executeQuery(sql, values, callback) {
        // Apply onBeforeQuery hook
        var hooked = CloudPages.hooks.onBeforeQuery(sql, values);
        sql = hooked.sql;
        values = hooked.params;

        var bound = bindParams(sql, values);

        FB.setStatus('Running query...');
        FB.setProgress(-1);

        // Try async first (works on all platforms)
        FB.queryAsync(bound.sql, bound.bindings).then(function (rows) {
            FB.setStatus('');
            FB.setProgress(0);
            rows = CloudPages.hooks.onAfterQuery(rows);
            callback(null, rows);
        }).catch(function (err) {
            FB.setStatus('');
            FB.setProgress(0);
            callback(err, null);
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // [9] Lifecycle / Init
    // ═══════════════════════════════════════════════════════════════════

    function init() {
        try {
            var config = loadConfig();
        } catch (e) {
            console.error(e.message);
            return;
        }

        var paramContainer = document.getElementById('parametersContainer');
        if (paramContainer) {
            renderParameters(config.parameters, paramContainer);
        }

        // Submit button
        var submitBtn = document.getElementById('submitButton');
        if (submitBtn) {
            submitBtn.addEventListener('click', function () {
                if (!validateParameters(config.parameters)) return;

                var values = collectValues(config.parameters);
                executeQuery(config.query, values, function (err, rows) {
                    if (err) {
                        console.error('CloudPages: query error:', err);
                        var container = document.getElementById('tableContainer');
                        if (container) container.innerHTML = '<p class="text-danger">Query error: ' + (err.message || err) + '</p>';
                        return;
                    }
                    renderTable(rows, config.columns, config.settings);
                });
            });
        }

        // Export button
        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                if (!_lastResultRows.length) return;
                var title = document.title || 'Export';
                if (config.settings.enable_xlsx_export) {
                    exportXLSX(_lastResultRows, title);
                } else if (config.settings.enable_csv_export) {
                    exportCSV(_lastResultRows, title);
                }
            });
        }

        // Load on open
        if (config.settings.load_on_open && submitBtn) {
            submitBtn.click();
        }
    }

    // Auto-init on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', init);

    // ═══════════════════════════════════════════════════════════════════
    // [10] Public API
    // ═══════════════════════════════════════════════════════════════════

    CloudPages.init = init;
    CloudPages.renderParameters = renderParameters;
    CloudPages.collectValues = collectValues;
    CloudPages.validateParameters = validateParameters;
    CloudPages.renderTable = renderTable;
    CloudPages.executeQuery = executeQuery;
    CloudPages.exportXLSX = exportXLSX;
    CloudPages.exportCSV = exportCSV;
    CloudPages.snakeToTitle = snakeToTitle;
    CloudPages.registerRenderer = registerRenderer;

    window.CloudPages = CloudPages;

})(window, jQuery);
