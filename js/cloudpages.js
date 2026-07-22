/**
 * cloudpages.js — ILC CloudPages Declarative Report Engine
 *
 * Reads JSON config from <script> tags and handles the full lifecycle:
 * parameters → SQL → table → export.
 *
 * Dependencies: fb.js (loaded first), jQuery, DataTables, SheetJS (XLSX)
 *
 * @version 2.1.0
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

    // Optional parameters: a line tagged /*opt:param_name*/ is removed before
    // binding when that parameter is empty, so blank filters simply vanish
    // from the WHERE clause instead of leaving an unbound :name. Demo mode
    // never prunes — the demo filter treats empty values as no-filter and the
    // SQL text must keep matching the #query tag for demo data lookup.
    function pruneOptionalClauses(sql, values) {
        return sql.split('\n').filter(function (line) {
            var m = line.match(/\/\*opt:([A-Za-z0-9_]+)\*\//);
            if (!m) return true;
            var v = values[m[1]];
            return !(v === undefined || v === null || v === '' || v === false ||
                (Array.isArray(v) && v.length === 0));
        }).join('\n');
    }

    CloudPages.pruneOptionalClauses = pruneOptionalClauses;

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

    // Multi dropdowns render as a compact checkbox dropdown (normal control
    // height, "All" / "N selected" summary) instead of a <select multiple>
    // list box — no Ctrl+click, no tall uneven parameter rows.
    function renderMultiDropdown(key, cfg) {
        var wrap = document.createElement('div');
        wrap.className = 'cp-multiselect';
        wrap.id = key;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'form-select text-start cp-ms-toggle';
        btn.textContent = 'All';
        wrap.appendChild(btn);

        var menu = document.createElement('div');
        menu.className = 'cp-ms-menu';
        wrap.appendChild(menu);

        function update() {
            var sel = menu.querySelectorAll('input:checked');
            btn.textContent = !sel.length ? 'All'
                : (sel.length === 1 ? sel[0].parentNode.textContent.trim()
                    : sel.length + ' selected');
        }
        function addOption(value, label) {
            var lab = document.createElement('label');
            lab.className = 'cp-ms-option';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'form-check-input';
            cb.value = String(value);
            cb.addEventListener('change', update);
            lab.appendChild(cb);
            lab.appendChild(document.createTextNode(' ' + label));
            menu.appendChild(lab);
        }

        btn.addEventListener('click', function () { wrap.classList.toggle('open'); });
        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target)) wrap.classList.remove('open');
        });

        if (cfg.options) {
            cfg.options.forEach(function (o) {
                addOption(o.value, o.label !== undefined ? o.label : String(o.value));
            });
        } else if (cfg.sql) {
            FB.queryAsync(cfg.sql).then(function (rows) {
                var displayFields = cfg.display ? cfg.display.split(',') : null;
                (rows || []).forEach(function (row) {
                    var label = displayFields
                        ? displayFields.map(function (f) { return row[f.trim()]; }).join(', ')
                        : row[cfg.value];
                    addOption(row[cfg.value], label);
                });
            }).catch(function (err) {
                console.error('CloudPages: failed to load options for ' + key + ':', err);
            });
        }
        return wrap;
    }

    // --- Dropdown ---
    registerRenderer('dropdown', {
        render: function (key, cfg) {
            if (cfg.mode === 'multi') return renderMultiDropdown(key, cfg);
            var select = document.createElement('select');
            select.className = 'form-select';
            select.id = key;

            // Default placeholder option
            var placeholder = document.createElement('option');
            placeholder.textContent = 'Select an option';
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.selected = true;
            select.appendChild(placeholder);

            // Static option list, or options loaded from SQL
            if (cfg.options) {
                cfg.options.forEach(function (o) {
                    var opt = document.createElement('option');
                    opt.value = String(o.value);
                    opt.textContent = o.label !== undefined ? o.label : String(o.value);
                    if (cfg.default !== undefined && String(cfg.default) === String(o.value)) {
                        placeholder.selected = false;
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });
            } else if (cfg.sql) {
                loadDropdownOptions(select, cfg);
            }

            return select;
        },
        getValue: function (key, cfg) {
            var el = document.getElementById(key);
            if (!el) return undefined;
            if (cfg && cfg.mode === 'multi') {
                return Array.prototype.map.call(
                    el.querySelectorAll('.cp-ms-menu input:checked'),
                    function (cb) { return cb.value; });
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

    // --- Relative date presets (date ranges only) ---
    // Mirrors Fishbowl's report-dialog relative dates: picking a preset fills
    // the from/to inputs; editing either input switches back to Custom.
    // Weeks start on Sunday, matching Fishbowl.

    // Preset list matches Fishbowl's UtilDateRange (2025.11) plus the
    // composable last_n/next_n entries. Grouped for the <optgroup> UI.
    var DATE_PRESET_GROUPS = [
        { label: '', items: [
            { key: 'custom', label: 'Custom' },
            { key: 'all', label: 'All' },
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' }
        ] },
        { label: 'Weeks', items: [
            { key: 'this_week', label: 'This Week' },
            { key: 'this_week_td', label: 'This Week-to-date' },
            { key: 'last_week', label: 'Last Week' },
            { key: 'last_week_td', label: 'Last Week-to-date' },
            { key: 'next_week', label: 'Next Week' },
            { key: 'next_4_weeks', label: 'Next 4 Weeks' }
        ] },
        { label: 'Months', items: [
            { key: 'this_month', label: 'This Month' },
            { key: 'this_month_td', label: 'This Month-to-date' },
            { key: 'last_month', label: 'Last Month' },
            { key: 'last_month_td', label: 'Last Month-to-date' },
            { key: 'next_month', label: 'Next Month' }
        ] },
        { label: 'Quarters', items: [
            { key: 'this_quarter', label: 'This Quarter' },
            { key: 'this_quarter_td', label: 'This Quarter-to-date' },
            { key: 'last_quarter', label: 'Last Quarter' },
            { key: 'last_quarter_td', label: 'Last Quarter-to-date' },
            { key: 'next_quarter', label: 'Next Quarter' }
        ] },
        { label: 'Years', items: [
            { key: 'this_year', label: 'This Year' },
            { key: 'this_year_td', label: 'This Year-to-date' },
            { key: 'last_year', label: 'Last Year' },
            { key: 'last_year_td', label: 'Last Year-to-date' },
            { key: 'next_year', label: 'Next Year' }
        ] },
        { label: 'Rolling', items: [
            { key: 'last_30', label: 'Last 30 Days' },
            { key: 'last_365', label: 'Last 365 Days' },
            { key: 'next_30', label: 'Next 30 Days' },
            { key: 'next_365', label: 'Next 365 Days' },
            { key: 'last_n', label: 'Last N…' },
            { key: 'next_n', label: 'Next N…' }
        ] }
    ];

    function _isoDate(d) {
        var mm = String(d.getMonth() + 1);
        var dd = String(d.getDate());
        return d.getFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
    }

    /**
     * Resolve a preset key to {start, end} ISO date strings. 'all' returns
     * {start: '', end: ''} (clears the filter). last_n/next_n take the count
     * and unit ('days'|'weeks'|'months'|'quarters'|'years') as extra args:
     * rolling windows anchored on today (inclusive).
     * Weeks start Sunday; quarters are calendar quarters — both match
     * Fishbowl's UtilDateRange.
     */
    function presetDates(preset, n, unit) {
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var y = today.getFullYear(), m = today.getMonth(), q = Math.floor(m / 3);
        var weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        function addDays(base, days) { var d = new Date(base); d.setDate(d.getDate() + days); return d; }
        var start = null, end = null;
        switch (preset) {
            case 'all': return { start: '', end: '' };
            case 'today': start = end = today; break;
            case 'yesterday': start = end = addDays(today, -1); break;

            case 'this_week': start = weekStart; end = addDays(weekStart, 6); break;
            case 'this_week_td': start = weekStart; end = today; break;
            case 'last_week': start = addDays(weekStart, -7); end = addDays(weekStart, -1); break;
            case 'last_week_td': start = addDays(weekStart, -7); end = addDays(weekStart, -7 + today.getDay()); break;
            case 'next_week': start = addDays(weekStart, 7); end = addDays(weekStart, 13); break;
            case 'next_4_weeks': start = addDays(weekStart, 7); end = addDays(weekStart, 7 + 27); break;

            case 'this_month': start = new Date(y, m, 1); end = new Date(y, m + 1, 0); break;
            case 'this_month_td': start = new Date(y, m, 1); end = today; break;
            case 'last_month': start = new Date(y, m - 1, 1); end = new Date(y, m, 0); break;
            case 'last_month_td':
                start = new Date(y, m - 1, 1);
                end = new Date(y, m - 1, Math.min(today.getDate(), new Date(y, m, 0).getDate())); break;
            case 'next_month': start = new Date(y, m + 1, 1); end = new Date(y, m + 2, 0); break;

            case 'this_quarter': start = new Date(y, q * 3, 1); end = new Date(y, q * 3 + 3, 0); break;
            case 'this_quarter_td': start = new Date(y, q * 3, 1); end = today; break;
            case 'last_quarter': start = new Date(y, (q - 1) * 3, 1); end = new Date(y, q * 3, 0); break;
            case 'last_quarter_td':
                start = new Date(y, (q - 1) * 3, 1);
                end = new Date(y, (q - 1) * 3 + (m - q * 3), today.getDate()); break;
            case 'next_quarter': start = new Date(y, (q + 1) * 3, 1); end = new Date(y, (q + 2) * 3, 0); break;

            case 'this_year': start = new Date(y, 0, 1); end = new Date(y, 11, 31); break;
            case 'this_year_td': start = new Date(y, 0, 1); end = today; break;
            case 'last_year': start = new Date(y - 1, 0, 1); end = new Date(y - 1, 11, 31); break;
            case 'last_year_td': start = new Date(y - 1, 0, 1); end = new Date(y - 1, m, today.getDate()); break;
            case 'next_year': start = new Date(y + 1, 0, 1); end = new Date(y + 1, 11, 31); break;

            case 'last_30': start = addDays(today, -29); end = today; break;
            case 'last_365': start = addDays(today, -364); end = today; break;
            case 'next_30': start = today; end = addDays(today, 29); break;
            case 'next_365': start = today; end = addDays(today, 364); break;

            case 'last_n': case 'next_n': {
                n = parseInt(n, 10);
                if (!n || n < 1) return null;
                var back = preset === 'last_n';
                var edge;
                switch (unit) {
                    case 'weeks': edge = addDays(today, back ? -(7 * n - 1) : 7 * n - 1); break;
                    case 'months': edge = addDays(new Date(y, m + (back ? -n : n), today.getDate()), back ? 1 : -1); break;
                    case 'quarters': edge = addDays(new Date(y, m + 3 * (back ? -n : n), today.getDate()), back ? 1 : -1); break;
                    case 'years': edge = addDays(new Date(y + (back ? -n : n), m, today.getDate()), back ? 1 : -1); break;
                    default: edge = addDays(today, back ? -(n - 1) : n - 1); break;
                }
                start = back ? edge : today;
                end = back ? today : edge;
                break;
            }
            default: return null;
        }
        return { start: _isoDate(start), end: _isoDate(end) };
    }

    CloudPages.presetDates = presetDates;

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

        if (type !== 'date') return group;

        // Date ranges get a relative-date preset picker above the inputs.
        var wrap = document.createElement('div');
        var preset = document.createElement('select');
        preset.className = 'form-select form-select-sm cp-range-preset';
        preset.id = key + '_preset';
        DATE_PRESET_GROUPS.forEach(function (g) {
            var parent = preset;
            if (g.label) {
                parent = document.createElement('optgroup');
                parent.label = g.label;
                preset.appendChild(parent);
            }
            g.items.forEach(function (p) {
                var opt = document.createElement('option');
                opt.value = p.key;
                opt.textContent = p.label;
                parent.appendChild(opt);
            });
        });

        // "Last N… / Next N…" composer: count + unit, shown only when chosen.
        var composer = document.createElement('div');
        composer.className = 'cp-range-composer';
        composer.hidden = true;
        var count = document.createElement('input');
        count.type = 'number';
        count.min = '1';
        count.value = '7';
        count.className = 'form-control form-control-sm';
        count.id = key + '_preset_n';
        var unit = document.createElement('select');
        unit.className = 'form-select form-select-sm';
        unit.id = key + '_preset_unit';
        ['days', 'weeks', 'months', 'quarters', 'years'].forEach(function (u) {
            var opt = document.createElement('option');
            opt.value = u;
            opt.textContent = u.charAt(0).toUpperCase() + u.slice(1);
            unit.appendChild(opt);
        });
        composer.appendChild(count);
        composer.appendChild(unit);

        function applyPreset() {
            var range = presetDates(preset.value, count.value, unit.value);
            if (!range) return;
            start.value = range.start;
            end.value = range.end;
        }
        preset.addEventListener('change', function () {
            composer.hidden = preset.value !== 'last_n' && preset.value !== 'next_n';
            applyPreset();
        });
        count.addEventListener('input', applyPreset);
        unit.addEventListener('change', applyPreset);
        function toCustom() { preset.value = 'custom'; composer.hidden = true; }
        start.addEventListener('input', toCustom);
        end.addEventListener('input', toCustom);

        wrap.appendChild(preset);
        wrap.appendChild(composer);
        wrap.appendChild(group);
        return wrap;
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

    // The engine renders parameters inside a collapsible "Parameters" panel
    // (a <details> with a caret) so every report gets the same experience:
    // open on load, auto-collapsed after a successful run, reopened by click.
    // Disable with "collapsible_parameters": false; retitle with
    // "parameters_label".
    function renderParameters(parameters, container, settings) {
        settings = settings || {};
        container.innerHTML = '';

        var fields = container;
        if (settings.collapsible_parameters !== false) {
            var panel = document.createElement('details');
            panel.className = 'cp-param-panel';
            panel.open = true;
            var summary = document.createElement('summary');
            summary.className = 'cp-param-summary';
            summary.textContent = settings.parameters_label || 'Parameters';
            panel.appendChild(summary);
            fields = document.createElement('div');
            fields.className = 'cp-param-fields';
            panel.appendChild(fields);
            container.appendChild(panel);
        }

        Object.keys(parameters).forEach(function (key) {
            var cfg = parameters[key];
            var renderer = paramRenderers[cfg.type] || paramRenderers['string'];

            var formGroup = document.createElement('div');
            formGroup.className = 'mb-3';
            if (cfg.mode === 'range') formGroup.className += ' cp-span-2';

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

            fields.appendChild(formGroup);
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
        // Parse date-only strings as local time: new Date('2026-07-08') is UTC
        // midnight, which toLocaleDateString() renders as the previous day in
        // timezones west of UTC.
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(val).trim());
        var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(val);
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

        // Build column definitions from the union of all row keys — rows from
        // SQL are uniform, but demo/JSON rows may omit keys per row.
        var keySet = {};
        var allKeys = [];
        rows.forEach(function (row) {
            Object.keys(row).forEach(function (k) {
                if (!keySet[k]) { keySet[k] = true; allKeys.push(k); }
            });
        });
        var dtColumns = allKeys.map(function (key) {
            var colCfg = columns[key] || {};
            var def = {
                data: key,
                title: colCfg.label || snakeToTitle(key),
                visible: colCfg.visible !== false,
                defaultContent: ''
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
        var dtConfig = {
            data: rows,
            columns: dtColumns,
            pageLength: settings.page_length || 25,
            order: [],
            autoWidth: true,
            responsive: true
        };

        // Runtime column show/hide via the DataTables Buttons ColVis extension
        // (settings.column_toggles). Requires the Buttons extension vendored;
        // degrades silently to a plain table when absent.
        if (settings.column_toggles && $.fn.dataTable.Buttons) {
            dtConfig.buttons = [{ extend: 'colvis', text: 'Columns' }];
            dtConfig.dom = 'Blfrtip';
        }

        // Grouped rows with per-group subtotals (settings.group_by +
        // settings.group_totals). Requires the RowGroup extension vendored.
        if (settings.group_by && $.fn.dataTable.RowGroup) {
            var groupKey = settings.group_by;
            var totalKeys = settings.group_totals || [];
            var keyIndex = {};
            allKeys.forEach(function (k, i) { keyIndex[k] = i; });
            dtConfig.orderFixed = [[keyIndex[groupKey] || 0, 'asc']];
            dtConfig.rowGroup = {
                dataSrc: groupKey,
                startRender: function (groupRows, group) {
                    return group + ' (' + groupRows.count() + ')';
                },
                endRender: totalKeys.length ? function (groupRows) {
                    var totals = {};
                    totalKeys.forEach(function (k) { totals[k] = 0; });
                    groupRows.data().each(function (row) {
                        totalKeys.forEach(function (k) {
                            var n = parseFloat(row[k]);
                            if (!isNaN(n)) totals[k] += n;
                        });
                    });
                    var tr = document.createElement('tr');
                    allKeys.forEach(function (k, i) {
                        if (dtColumns[i].visible === false) return;
                        var td = document.createElement('td');
                        if (totals[k] !== undefined) {
                            var renderFn = columnRenderFn(columns[k], settings);
                            td.textContent = renderFn ? renderFn(totals[k]) : formatNumber(totals[k], settings.qty_unit_format);
                            td.style.fontWeight = '600';
                        } else if (i === 0 || k === groupKey) {
                            td.textContent = 'Total';
                            td.style.fontWeight = '600';
                        }
                        tr.appendChild(td);
                    });
                    return tr;
                } : null
            };
        }

        _dataTableInstance = $(table).DataTable(dtConfig);
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

        // Demo mode: keep the original SQL text (so the DemoAdapter can match
        // it to the #query tag) and pass raw values — arrays and ranges intact
        // for the generated demo filter (see Demo Mode section).
        var bound = FB.isDemo
            ? { sql: sql, bindings: values }
            : bindParams(pruneOptionalClauses(sql, values), values);

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
    // [9] Demo Mode
    // ═══════════════════════════════════════════════════════════════════

    // Outside JXBrowser, demo data makes the full report work in a plain
    // browser (parameter dropdowns, filtered results, export). Sources:
    //   1. Inline <script id="demo" type="application/json"> (wins if both)
    //   2. settings.demo_data — path to a JSON file, fetched lazily so
    //      production pages never load or parse demo rows.
    // JSON shape:
    //   { "query": [row, ...],                     result rows for the report
    //     "parameters": { "<name>": [row, ...] },  rows for SQL-driven params
    //     "user": {...}, "context": {...} }        optional fb.js demo extras
    // Result filtering mirrors the SQL WHERE clause: each parameter filters
    // the demo-row column named by its `demo_column` (default: the parameter
    // name), using predicates derived from the parameter type/mode.

    function setupDemoMode(config) {
        if (FB.isJXBrowser) return Promise.resolve(false);

        var inline = document.getElementById('demo');
        var loaded;
        if (inline) {
            try {
                loaded = Promise.resolve(JSON.parse(inline.textContent.trim()));
            } catch (e) {
                loaded = Promise.reject(new Error('<script id="demo"> has invalid JSON: ' + e.message));
            }
        } else if (config.settings.demo_data) {
            loaded = fetch(config.settings.demo_data).then(function (res) {
                if (!res.ok) throw new Error('demo_data fetch failed: HTTP ' + res.status);
                return res.json();
            });
        } else {
            return Promise.resolve(false);
        }

        return loaded.then(function (demo) {
            var queries = {};
            Object.keys(config.parameters).forEach(function (name) {
                var cfg = config.parameters[name];
                if (cfg.sql && demo.parameters && demo.parameters[name]) {
                    queries[cfg.sql.trim()] = demo.parameters[name];
                }
            });
            queries[config.query.trim()] = makeDemoQueryFn(demo.query || [], config.parameters);
            FB.configure({
                environment: 'demo',
                demoData: { queries: queries, user: demo.user, context: demo.context }
            });
            return true;
        });
    }

    function makeDemoQueryFn(rows, parameters) {
        return function (params) {
            return rows.filter(function (row) {
                return Object.keys(parameters).every(function (name) {
                    var cfg = parameters[name];
                    // Params that shape the SQL but don't filter rows
                    // (e.g. a date-column selector) opt out of demo filtering.
                    if (cfg.demo_filter === false) return true;
                    var cell = row[cfg.demo_column || name];
                    if (cfg.mode === 'range') {
                        return demoInRange(cell, params[name + '_start'], params[name + '_end'], cfg.type);
                    }
                    var val = params[name];
                    if (val === undefined || val === null || val === '' ||
                        (Array.isArray(val) && !val.length)) return true;
                    if (Array.isArray(val)) {
                        return val.some(function (v) { return String(cell) === String(v); });
                    }
                    if (cfg.type === 'checkbox') {
                        return !val || cell === true || cell === 1 || cell === '1' || cell === 'true';
                    }
                    if (cfg.type === 'string') {
                        return String(cell == null ? '' : cell).toLowerCase()
                            .indexOf(String(val).toLowerCase()) >= 0;
                    }
                    return String(cell) === String(val);
                });
            });
        };
    }

    function demoInRange(cell, start, end, type) {
        if (!start && !end) return true;
        if (cell === undefined || cell === null) return false;
        if (type === 'int' || type === 'decimal') {
            var n = parseFloat(cell);
            if (start && n < parseFloat(start)) return false;
            if (end && n > parseFloat(end)) return false;
            return true;
        }
        // date/time/timestamp: ISO strings compare lexicographically; compare
        // only the bound's own length so a date bound matches timestamp cells.
        var s = String(cell);
        if (start && s.slice(0, String(start).length) < String(start)) return false;
        if (end && s.slice(0, String(end).length) > String(end)) return false;
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // [10] Lifecycle / Init
    // ═══════════════════════════════════════════════════════════════════

    function init() {
        try {
            var config = loadConfig();
        } catch (e) {
            console.error(e.message);
            return;
        }

        // Demo setup must finish before the UI renders: SQL-driven parameters
        // (dropdowns) query as soon as they render.
        setupDemoMode(config).then(function () {
            initUI(config);
        }).catch(function (e) {
            console.error('CloudPages: demo setup failed:', e.message);
            var container = document.getElementById('tableContainer');
            if (container) container.innerHTML = '<p class="text-danger">Demo data failed to load: ' + (e.message || e) + '</p>';
        });
    }

    function initUI(config) {
        var paramContainer = document.getElementById('parametersContainer');
        if (paramContainer) {
            renderParameters(config.parameters, paramContainer, config.settings);
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
                    var panel = document.querySelector('.cp-param-panel');
                    if (panel) panel.open = false;
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
    // [11] Public API
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
