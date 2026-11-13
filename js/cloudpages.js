/**
 * cloudpages.js — ILC CloudPages Declarative Report Engine
 *
 * Reads JSON config from <script> tags and handles the full lifecycle:
 * parameters → SQL → table → export.
 *
 * Dependencies: fb.js (loaded first), jQuery, DataTables, SheetJS (XLSX)
 *
 * @version 0.0.0-dev
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
    var _lastRunMeta = null;   // { title, timestamp, params: [{label, value}] }

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
        settings.page_length = settings.page_length || 100;
        settings.paginate_over = settings.paginate_over || 100;
        settings.enable_xlsx_export = settings.enable_xlsx_export !== false;
        settings.enable_csv_export = settings.enable_csv_export !== false;
        settings.enable_markdown_export = settings.enable_markdown_export !== false;
        settings.size = settings.size || (settings.dense ? 's' : 'm');   // s=dense, m=normal, l=large
        settings.theme = settings.theme || 'auto';

        // Custom fields: { "<sql alias>": "<tablereference.tableRefName>" }.
        // The alias is written into generated SQL, so it must be a plain identifier.
        if (settings.custom_fields) {
            Object.keys(settings.custom_fields).forEach(function (alias) {
                if (!CF_ALIAS_RE.test(alias)) {
                    throw new Error('CloudPages: custom_fields alias "' + alias + '" is not a plain SQL identifier.');
                }
            });
        }

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

        // Type-to-filter box at the top of the menu — lists can hold
        // hundreds/thousands of options (vendors, parts).
        var search = document.createElement('input');
        search.type = 'text';
        search.className = 'form-control form-control-sm cp-ms-search';
        search.placeholder = 'Type to filter…';
        search.addEventListener('input', function () {
            var q = search.value.toLowerCase();
            Array.prototype.forEach.call(menu.querySelectorAll('.cp-ms-option'), function (opt) {
                opt.hidden = q !== '' && opt.textContent.toLowerCase().indexOf(q) < 0;
            });
        });
        menu.appendChild(search);

        // Select all / none — applies to the options currently visible under
        // the type-to-filter box, so "filter to 'ACME', select all" works.
        var selAll = document.createElement('label');
        selAll.className = 'cp-ms-option cp-ms-selectall';
        var selAllCb = document.createElement('input');
        selAllCb.type = 'checkbox';
        selAllCb.className = 'form-check-input';
        selAll.appendChild(selAllCb);
        selAll.appendChild(document.createTextNode(' Select all'));
        menu.appendChild(selAll);
        selAllCb.addEventListener('change', function () {
            Array.prototype.forEach.call(menu.querySelectorAll('.cp-ms-option:not(.cp-ms-selectall)'), function (opt) {
                if (opt.hidden) return;
                var cb = opt.querySelector('input');
                if (cb) cb.checked = selAllCb.checked;
            });
            update();
        });

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

        btn.addEventListener('click', function () {
            wrap.classList.toggle('open');
            if (wrap.classList.contains('open')) search.focus();
        });
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
    // [5b] Parameter Summary (human-readable values for export metadata)
    // ═══════════════════════════════════════════════════════════════════

    // One {label, value} entry per parameter, using what the USER saw:
    // dropdown option labels (not raw ids), "start to end" for ranges,
    // Yes/No for checkboxes, "All" for anything left empty.
    function parameterSummary(parameters) {
        return Object.keys(parameters).map(function (key) {
            var cfg = parameters[key];
            var label = cfg.label || snakeToTitle(key);
            var value;
            if (cfg.mode === 'range') {
                var startEl = document.getElementById(key + '_start');
                var endEl = document.getElementById(key + '_end');
                var st = startEl ? startEl.value : '', en = endEl ? endEl.value : '';
                var presetEl = document.getElementById(key + '_preset');
                var presetTxt = presetEl && presetEl.value !== 'custom' && presetEl.selectedIndex >= 0
                    ? presetEl.options[presetEl.selectedIndex].textContent : null;
                value = (!st && !en) ? 'All'
                    : (st || '…') + ' to ' + (en || '…') + (presetTxt ? ' (' + presetTxt + ')' : '');
            } else if (cfg.type === 'checkbox') {
                var cb = document.getElementById(key);
                value = cb && cb.checked ? 'Yes' : 'No';
            } else if (cfg.type === 'dropdown' && cfg.mode === 'multi') {
                var wrap = document.getElementById(key);
                var sel = wrap ? wrap.querySelectorAll('.cp-ms-menu .cp-ms-option:not(.cp-ms-selectall) input:checked') : [];
                value = !sel.length ? 'All'
                    : Array.prototype.map.call(sel, function (c) { return c.parentNode.textContent.trim(); }).join(', ');
            } else if (cfg.type === 'dropdown') {
                var selEl = document.getElementById(key);
                value = (selEl && selEl.value !== '' && selEl.selectedIndex >= 0)
                    ? selEl.options[selEl.selectedIndex].textContent : 'All';
            } else if (cfg.type === 'autocomplete') {
                var ac = document.getElementById(key);
                value = ac && ac.value ? ac.value : 'All';
            } else {
                var el = document.getElementById(key);
                value = el && el.value !== '' ? el.value : 'All';
            }
            return { label: label, value: value };
        });
    }

    CloudPages.parameterSummary = parameterSummary;

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

    function escHtml(val) {
        return String(val === null || val === undefined ? '' : val)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Column "link": { "module": "Sales Order", "key": "order_num" } makes the
    // cell open that record in Fishbowl. hyperLink takes the module name as
    // Fishbowl spells it and the record's NUMBER or NAME, never its id. "key"
    // names the row column that holds it and defaults to the cell's own
    // column. Only the Fishbowl client can open a record, so everywhere else
    // (demo, web) the cell stays plain text.
    // Exposed so a test can stand in for the client.
    CloudPages.linksEnabled = function () { return !!FB.isJXBrowser; };

    function linkCellHtml(colCfg, key, row, text) {
        var link = colCfg.link;
        var param = row[link.key || key];
        if (!link.module || param === null || param === undefined || param === '') return escHtml(text);
        return '<a href="#" class="cp-link" data-cp-module="' + escHtml(link.module) +
            '" data-cp-param="' + escHtml(param) + '">' + escHtml(text) + '</a>';
    }

    function onLinkClick(e) {
        var a = e.target && e.target.closest ? e.target.closest('a.cp-link') : null;
        if (!a) return;
        e.preventDefault();
        var module = a.getAttribute('data-cp-module');
        var param = a.getAttribute('data-cp-param');
        try {
            FB.hyperLink(module, param);
        } catch (err) {
            console.error('CloudPages: could not open ' + module + ' ' + param + ':', err);
            FB.setStatus('Could not open ' + module + ' ' + param + '.');
        }
    }

    // settings.grand_totals: the sum of each listed column over the given
    // rows. A value that is not a number adds nothing.
    function sumColumns(rows, keys) {
        var totals = {};
        keys.forEach(function (k) { totals[k] = 0; });
        rows.forEach(function (row) {
            keys.forEach(function (k) {
                var n = parseFloat(row[k]);
                if (!isNaN(n)) totals[k] += n;
            });
        });
        return totals;
    }

    // The total row an export appends: sums in the total columns, the word
    // "Total" in the first column that is not one of them.
    function grandTotalExportRow(data) {
        var totalKeys = ((_config && _config.settings) || {}).grand_totals || [];
        if (!totalKeys.length || !data || !data.length) return null;
        var keys = Object.keys(data[0]);
        var present = totalKeys.filter(function (k) { return keys.indexOf(k) >= 0; });
        if (!present.length) return null;
        var totals = sumColumns(data, present);
        var row = {}, labelled = false;
        keys.forEach(function (k) {
            if (totals[k] !== undefined) { row[k] = totals[k]; return; }
            row[k] = labelled ? '' : 'Total';
            labelled = true;
        });
        return row;
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
            if (colCfg.link && CloudPages.linksEnabled()) {
                def.render = function (data, type, row) {
                    var text = renderFn ? renderFn(data) : data;
                    return type === 'display' ? linkCellHtml(colCfg, key, row, text) : text;
                };
            } else if (renderFn) {
                def.render = function (data) { return renderFn(data); };
            }
            return def;
        });

        // Create table element
        var table = document.createElement('table');
        table.id = 'cp-data-table';
        table.className = 'table table-striped table-hover';
        container.appendChild(table);
        table.addEventListener('click', onLinkClick);

        // Grand total row (settings.grand_totals): one footer row that sums
        // the listed columns over the rows matching the current search.
        var grandKeys = (settings.grand_totals || []).filter(function (k) { return keySet[k]; });
        if (grandKeys.length) {
            var tfoot = document.createElement('tfoot');
            var footRow = document.createElement('tr');
            footRow.className = 'cp-grand-total';
            allKeys.forEach(function () { footRow.appendChild(document.createElement('th')); });
            tfoot.appendChild(footRow);
            table.appendChild(tfoot);
        }

        // Pagination: small result sets render whole (computers are fast);
        // beyond settings.paginate_over (default 100) paginate at
        // settings.page_length (default 100) per page.
        var paginate = rows.length >= (settings.paginate_over || 100);

        // Initialize DataTable
        var dtConfig = {
            data: rows,
            columns: dtColumns,
            paging: paginate,
            pageLength: paginate ? (settings.page_length || 100) : -1,
            order: [],
            autoWidth: true,
            responsive: true
        };

        // Runtime column show/hide via the DataTables Buttons ColVis extension
        // (settings.column_toggles). Requires the Buttons extension vendored;
        // degrades silently to a plain table when absent.
        var hasButtons = settings.column_toggles && $.fn.dataTable.Buttons;
        if (hasButtons) {
            dtConfig.buttons = [{ extend: 'colvis', text: 'Columns' }];
        }

        // One toolbar row above the table: [Columns] [Show N entries] left,
        // search right; info + paging share a row below.
        var lengthCtl = paginate ? 'l' : '';
        dtConfig.dom =
            "<'cp-table-toolbar d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2'" +
            "<'d-flex align-items-center gap-2'" + (hasButtons ? 'B' : '') + lengthCtl + ">f>" +
            "rt" +
            "<'d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2'ip>";

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
                    // Runs on every draw: read the CURRENT column visibility
                    // so runtime column toggles keep the totals row aligned.
                    var visible = groupRows.table().columns().visible().toArray();
                    var firstVisible = visible.indexOf(true);
                    var tr = document.createElement('tr');
                    allKeys.forEach(function (k, i) {
                        if (!visible[i]) return;
                        var td = document.createElement('td');
                        if (totals[k] !== undefined) {
                            var renderFn = columnRenderFn(columns[k], settings);
                            td.textContent = renderFn ? renderFn(totals[k]) : formatNumber(totals[k], settings.qty_unit_format);
                            td.style.fontWeight = '600';
                        } else if (i === firstVisible) {
                            td.textContent = 'Total';
                            td.style.fontWeight = '600';
                        }
                        tr.appendChild(td);
                    });
                    return tr;
                } : null
            };
        }

        if (grandKeys.length) {
            dtConfig.footerCallback = function () {
                var api = this.api();
                var totals = sumColumns(api.rows({ search: 'applied' }).data().toArray(), grandKeys);
                var visible = api.columns().visible().toArray();
                var labelled = false;
                allKeys.forEach(function (k, i) {
                    var cell = api.column(i).footer();
                    if (!cell) return;
                    if (totals[k] !== undefined) {
                        var fn = columnRenderFn(columns[k], settings);
                        cell.textContent = fn ? fn(totals[k]) : formatNumber(totals[k], settings.qty_unit_format);
                    } else if (visible[i] && !labelled) {
                        cell.textContent = 'Total';
                        labelled = true;
                    } else {
                        cell.textContent = '';
                    }
                });
            };
        }

        _dataTableInstance = $(table).DataTable(dtConfig);

        applySize(currentSize(settings));

        // The "Total" label sits in the first visible column, so a column
        // toggle has to redraw the footer.
        if (grandKeys.length) {
            _dataTableInstance.on('column-visibility.dt', function () {
                _dataTableInstance.draw(false);
            });
        }

        // Toggling a column adjusts data-row cells in place without a draw,
        // so RowGroup's header/totals rows keep their old cell layout. Force
        // a draw so groups re-render against the new visibility.
        if (dtConfig.rowGroup) {
            _dataTableInstance.on('column-visibility.dt', function () {
                _dataTableInstance.draw(false);
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // [6b] Dense mode + Theme
    // ═══════════════════════════════════════════════════════════════════

    // Size: 's' dense (scan many rows), 'm' normal, 'l' large (meetings /
    // screen-shares). Persisted where storage exists (data: URLs throw).
    function currentSize(settings) {
        try {
            var saved = localStorage.getItem('cp-size');
            if (saved === 's' || saved === 'm' || saved === 'l') return saved;
        } catch (e) { /* no storage */ }
        return (settings && settings.size) || 'm';
    }
    function applySize(mode) {
        document.body.classList.toggle('cp-dense', mode === 's');
        document.body.classList.toggle('cp-large', mode === 'l');
        Array.prototype.forEach.call(document.querySelectorAll('.cp-size-btn'), function (b) {
            b.classList.toggle('active', b.dataset.size === mode);
        });
        try { localStorage.setItem('cp-size', mode); } catch (e) { /* no storage */ }
    }
    CloudPages.setSize = applySize;

    // Theme: settings.theme 'auto' | 'light' | 'dark'. Bootstrap 5.3 does the
    // heavy lifting via data-bs-theme. 'auto' follows the OS; if fb.js ever
    // exposes the Fishbowl client theme (FB.getClientTheme), it wins.
    function applyTheme(mode) {
        var root = document.documentElement;
        function set(dark) { root.setAttribute('data-bs-theme', dark ? 'dark' : 'light'); }
        if (mode === 'dark') return set(true);
        if (mode === 'light') return set(false);
        // auto
        if (typeof FB !== 'undefined' && typeof FB.getClientTheme === 'function') {
            try {
                var t = FB.getClientTheme();
                if (t === 'dark' || t === 'light') return set(t === 'dark');
            } catch (e) { /* fall through to OS preference */ }
        }
        var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
        set(!!(mq && mq.matches));
        if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { set(e.matches); });
    }
    CloudPages.applyTheme = applyTheme;

    // Header control cluster — rendered ONLY when the page provides an empty
    // <div id="cp-controls"></div> (typically in its header, by the version
    // stamp): a theme cycler (Auto → Light → Dark) and an S/M/L size picker.
    var THEME_ORDER = ['auto', 'light', 'dark'];
    var THEME_GLYPH = { auto: '\u25d0', light: '\u2600', dark: '\u263e' };
    function currentThemePref(settings) {
        try {
            var saved = localStorage.getItem('cp-theme');
            if (THEME_ORDER.indexOf(saved) >= 0) return saved;
        } catch (e) { /* no storage */ }
        return (settings && settings.theme) || 'auto';
    }
    function buildControls(settings) {
        var host = document.getElementById('cp-controls');
        if (!host) return;
        host.classList.add('cp-controls');

        // Theme cycler
        var themeBtn = document.createElement('button');
        themeBtn.type = 'button';
        themeBtn.className = 'btn btn-sm btn-outline-secondary cp-theme-toggle';
        var mode = currentThemePref(settings);
        function paintTheme() {
            themeBtn.textContent = THEME_GLYPH[mode];
            themeBtn.title = 'Theme: ' + mode.charAt(0).toUpperCase() + mode.slice(1) +
                (mode === 'auto' ? ' (follow system)' : '') + ' — click to change';
        }
        themeBtn.addEventListener('click', function () {
            mode = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
            applyTheme(mode);
            paintTheme();
            try { localStorage.setItem('cp-theme', mode); } catch (e) { /* no storage */ }
        });
        paintTheme();
        host.appendChild(themeBtn);

        // S/M/L size picker
        var seg = document.createElement('div');
        seg.className = 'btn-group btn-group-sm cp-size-seg';
        seg.setAttribute('role', 'group');
        [['s', 'S', 'Small — dense rows'], ['m', 'M', 'Medium — normal'], ['l', 'L', 'Large — meetings']].forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-outline-secondary cp-size-btn';
            b.dataset.size = t[0];
            b.textContent = t[1];
            b.title = t[2];
            b.addEventListener('click', function () { applySize(t[0]); });
            seg.appendChild(b);
        });
        host.appendChild(seg);
        applySize(currentSize(settings));
    }

    // ═══════════════════════════════════════════════════════════════════
    // [7] Export Engine
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Build the export workbook, applying column formats from the columns
     * config: 'date' columns become real date cells (typed, mm/dd/yyyy),
     * 'currency'/'number'/'percent' become numeric cells with number formats —
     * so Excel can sort, filter, and pivot them natively.
     */
    function buildWorkbook(rows) {
        var columns = cfColumns((_config && _config.columns) || {});
        var data = rows.map(function (row) {
            var out = {};
            Object.keys(row).forEach(function (k) {
                var fmt = (columns[k] || {}).format;
                var v = row[k];
                if (v !== null && v !== undefined && v !== '') {
                    if (fmt === 'date') {
                        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
                        if (m) v = new Date(+m[1], +m[2] - 1, +m[3]);
                        else if (!isNaN(new Date(v).getTime())) v = new Date(v);
                    } else if (fmt === 'currency' || fmt === 'number' || fmt === 'percent') {
                        var n = parseFloat(v);
                        if (!isNaN(n)) v = n;
                    }
                }
                out[k] = v;
            });
            return out;
        });
        var totalRow = grandTotalExportRow(rows);
        if (totalRow) data.push(totalRow);
        var ws = XLSX.utils.json_to_sheet(data, { cellDates: true });
        // Number formats per column
        if (data.length) {
            var keys = Object.keys(data[0]);
            var range = XLSX.utils.decode_range(ws['!ref']);
            keys.forEach(function (k, c) {
                var fmt = (columns[k] || {}).format;
                var z = fmt === 'date' ? 'mm/dd/yyyy'
                    : fmt === 'currency' ? '$#,##0.00'
                    : fmt === 'number' ? '#,##0.00'
                    : fmt === 'percent' ? '0.00%'
                    : null;
                if (!z) return;
                for (var r = range.s.r + 1; r <= range.e.r; r++) {
                    var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (cell && (cell.t === 'n' || cell.t === 'd')) cell.z = z;
                }
            });
        }
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Results');
        return wb;
    }

    // Second sheet recording how the file was generated — the fastest support
    // triage there is ("you picked the FUTURE 7 months"). Skipped only when
    // the export options explicitly turn it off.
    function appendParametersSheet(wb) {
        if (!_lastRunMeta) return;
        var aoa = [
            ['Report', _lastRunMeta.title],
            ['Generated', _lastRunMeta.timestamp],
            ['Rows', String(_lastResultRows.length)],
            [],
            ['Parameter', 'Value']
        ];
        _lastRunMeta.params.forEach(function (pr) { aoa.push([pr.label, pr.value]); });
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 28 }, { wch: 48 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Parameters');
        // Parameters open first — the provenance is the point.
        wb.SheetNames.splice(wb.SheetNames.indexOf('Parameters'), 1);
        wb.SheetNames.unshift('Parameters');
    }

    CloudPages.buildWorkbook = buildWorkbook;

    function exportXLSX(rows, filename, opts) {
        if (typeof XLSX === 'undefined') {
            console.error('CloudPages: SheetJS (XLSX) not loaded.');
            return;
        }
        opts = opts || {};
        var data = CloudPages.hooks.onExport(rows, 'xlsx');
        var wb = buildWorkbook(data);
        if (opts.includeParams !== false) appendParametersSheet(wb);

        if (FB.isJXBrowser) {
            var b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
            FB.saveFile('Save Report', 'xlsx', 'Excel Files', b64, filename + '.xlsx', true);
        } else {
            XLSX.writeFile(wb, filename + '.xlsx');
        }
    }

    function exportCSV(rows, filename, opts) {
        opts = opts || {};
        var data = CloudPages.hooks.onExport(rows, 'csv');
        if (!data || !data.length) return;

        var keys = Object.keys(data[0]);
        var lines = [];
        // Optional: parameter provenance as comment lines above the header.
        // Off by default — CSV consumers usually want pure flat data.
        if (opts.includeParams === true && _lastRunMeta) {
            lines.push(csvEscape('# ' + _lastRunMeta.title + ' — generated ' + _lastRunMeta.timestamp));
            _lastRunMeta.params.forEach(function (pr) {
                lines.push(csvEscape('# ' + pr.label + ': ' + pr.value));
            });
        }
        lines.push(keys.map(csvEscape).join(','));
        data.forEach(function (row) {
            lines.push(keys.map(function (k) { return csvEscape(row[k]); }).join(','));
        });
        // Leading BOM: Excel treats BOM-less CSV as ANSI and mangles UTF-8
        // (em-dashes become "â€\u201d", accents break).
        var csvStr = '\ufeff' + lines.join('\r\n');

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

    // Markdown export — title + parameters block + a GFM table. Made for
    // feeding results into wikis, tickets, and LLM workflows.
    function mdEscape(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    }
    function exportMarkdown(rows, filename, opts) {
        opts = opts || {};
        var data = CloudPages.hooks.onExport(rows, 'markdown');
        if (!data || !data.length) return;
        var keys = Object.keys(data[0]);
        var out = [];
        out.push('# ' + ((_lastRunMeta && _lastRunMeta.title) || filename));
        out.push('');
        if (opts.includeParams !== false && _lastRunMeta) {
            out.push('Generated ' + _lastRunMeta.timestamp + ' — ' + data.length + ' rows');
            out.push('');
            out.push('| Parameter | Value |');
            out.push('| --- | --- |');
            _lastRunMeta.params.forEach(function (pr) {
                out.push('| ' + mdEscape(pr.label) + ' | ' + mdEscape(pr.value) + ' |');
            });
            out.push('');
        }
        out.push('| ' + keys.map(mdEscape).join(' | ') + ' |');
        out.push('| ' + keys.map(function () { return '---'; }).join(' | ') + ' |');
        data.forEach(function (row) {
            out.push('| ' + keys.map(function (k) { return mdEscape(row[k]); }).join(' | ') + ' |');
        });
        var totalRow = grandTotalExportRow(data);
        if (totalRow) out.push('| ' + keys.map(function (k) { return mdEscape(totalRow[k]); }).join(' | ') + ' |');
        var md = out.join('\n');

        if (FB.isJXBrowser) {
            var b64 = btoa(unescape(encodeURIComponent(md)));
            FB.saveFile('Save Report', 'md', 'Markdown Files', b64, filename + '.md', true);
        } else {
            var blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename + '.md';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // [7b] Custom Fields
    // ═══════════════════════════════════════════════════════════════════
    //
    // settings.custom_fields maps a SQL alias to a Fishbowl table:
    //     "custom_fields": { "so": "SO", "product": "Product" }
    // The #query carries up to three markers:
    //     /*cf:select*/   after the last SELECT column
    //     /*cf:group*/    after the last GROUP BY expression (summary reports)
    //     /*cf:where*/    among the WHERE conditions
    // In a UNION, each branch lists the aliases it has: /*cf:select po part*/.
    // A chosen field from any other record is written as NULL in that branch,
    // as a column and inside a filter condition.
    // Nothing chosen: the markers are removed and no custom field is read.
    // A column adds CustomFieldById(<alias>.customFields, :id) at the select
    // and group markers. Filters add one AND ( ... ) block at the where
    // marker. Field ids and filter values are bound, never joined in.
    // Definitions load when the dialog first opens, not on page open.

    var CF_ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var CF_KEY_RE = /^cf_[A-Za-z_][A-Za-z0-9_]*_\d+$/;
    var CF_DEFS_SQL = 'SELECT cf.id AS id, cf.name AS name, cf.customFieldTypeId AS type_id, ' +
        'cf.listId AS list_id, tr.tableRefName AS table_ref, tr.displayName AS table_name ' +
        'FROM customfield cf JOIN tablereference tr ON tr.tableId = cf.tableId ' +
        'WHERE cf.activeFlag = 1 AND tr.tableRefName IN (:cf_tables) ' +
        'ORDER BY tr.displayName, cf.sortOrder, cf.name';
    var CF_LISTS_SQL = 'SELECT cli.listId AS list_id, cli.name AS name FROM customlistitem cli ' +
        'WHERE cli.listId IN (:cf_lists) ORDER BY cli.name';
    var CF_TYPE_FORMAT = { 2: 'date', 3: 'currency', 4: 'number', 5: 'number' };

    // customfieldtype: 1 Text, 2 Date, 3 Money, 4 Quantity, 5 Count,
    // 6 Checkbox, 7 Drop-Down List, 9 Long Text, 10 URL.
    function cfKind(typeId) {
        if (typeId === 2) return 'date';
        if (typeId === 3 || typeId === 4 || typeId === 5) return 'number';
        if (typeId === 6) return 'checkbox';
        if (typeId === 7) return 'list';
        return 'text';
    }

    var CF_OPS = {
        text: [['contains', 'contains'], ['not_contains', 'does not contain'], ['eq', 'is'], ['ne', 'is not'],
               ['starts', 'starts with'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
        number: [['eq', '='], ['ne', '≠'], ['gt', '>'], ['ge', '≥'], ['lt', '<'], ['le', '≤'],
                 ['between', 'is between'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
        date: [['eq', 'is'], ['lt', 'is before'], ['gt', 'is after'], ['between', 'is between'],
               ['empty', 'is empty'], ['not_empty', 'is not empty']],
        list: [['eq', 'is'], ['ne', 'is not'], ['empty', 'is empty'], ['not_empty', 'is not empty']],
        checkbox: [['checked', 'is checked'], ['unchecked', 'is not checked']]
    };
    var CF_CMP = { eq: '=', ne: '<>', gt: '>', ge: '>=', lt: '<', le: '<=' };
    var CF_TRUE = ['true', '1', 'yes'];

    function cfOpArity(op) {
        if (op === 'empty' || op === 'not_empty' || op === 'checked' || op === 'unchecked') return 0;
        return op === 'between' ? 2 : 1;
    }

    function cfOpLabel(kind, op) {
        var found = (CF_OPS[kind] || []).filter(function (o) { return o[0] === op; })[0];
        return found ? found[1] : op;
    }

    function cfFilterComplete(f) {
        var n = cfOpArity(f.op);
        if (n >= 1 && (f.value === undefined || f.value === null || f.value === '')) return false;
        if (n === 2 && (f.value2 === undefined || f.value2 === null || f.value2 === '')) return false;
        return true;
    }

    // columns: [field]   filters: [{ join: 'AND'|'OR', field, op, value, value2 }]
    // field:   { alias, id, name, typeId, listId, tableName }
    var _cf = { defs: null, lists: {}, loading: null, columns: [], filters: [] };

    function cfKey(alias, id) { return 'cf_' + alias + '_' + id; }
    function cfFieldKey(f) { return cfKey(f.alias, f.id); }
    function cfFieldLabel(f) { return f.tableName + ': ' + f.name; }
    function cfState() { return { columns: _cf.columns.slice(), filters: _cf.filters.filter(cfFilterComplete) }; }
    function cfFieldOk(f) { return f && CF_ALIAS_RE.test(f.alias) && !isNaN(parseInt(f.id, 10)); }

    function cfLoadDefinitions(settings) {
        if (_cf.defs) return Promise.resolve(_cf.defs);
        if (_cf.loading) return _cf.loading;
        var map = settings.custom_fields;
        var tables = [];
        Object.keys(map).forEach(function (a) { if (tables.indexOf(map[a]) < 0) tables.push(map[a]); });
        function run(sql, values) {
            var bound = FB.isDemo ? { sql: sql, bindings: values } : bindParams(sql, values);
            return FB.queryAsync(bound.sql, bound.bindings);
        }
        _cf.loading = run(CF_DEFS_SQL, { cf_tables: tables }).then(function (rows) {
            var defs = [];
            Object.keys(map).forEach(function (alias) {
                (rows || []).forEach(function (r) {
                    if (String(r.table_ref) !== String(map[alias])) return;
                    var listId = parseInt(r.list_id, 10);
                    defs.push({
                        alias: alias, id: parseInt(r.id, 10), name: String(r.name),
                        typeId: parseInt(r.type_id, 10), listId: isNaN(listId) ? null : listId,
                        tableName: r.table_name || r.table_ref
                    });
                });
            });
            var listIds = [];
            defs.forEach(function (d) {
                if (cfKind(d.typeId) === 'list' && d.listId !== null && listIds.indexOf(d.listId) < 0) listIds.push(d.listId);
            });
            if (!listIds.length) return defs;
            // A list whose items do not load falls back to a text box.
            return run(CF_LISTS_SQL, { cf_lists: listIds }).then(function (items) {
                (items || []).forEach(function (it) {
                    var id = parseInt(it.list_id, 10);
                    if (listIds.indexOf(id) < 0) return;
                    (_cf.lists[id] = _cf.lists[id] || []).push(String(it.name));
                });
                return defs;
            }, function (err) {
                console.warn('CloudPages: custom list items did not load:', err);
                return defs;
            });
        }).then(function (defs) {
            _cf.defs = defs;
            _cf.loading = null;
            return defs;
        }, function (err) { _cf.loading = null; throw err; });
        return _cf.loading;
    }

    // One filter as SQL. `n` is the bind-name stem for this filter.
    // absent: this part of the query does not have the field's record (a
    // UNION branch). The field reads as NULL there, so the same condition is
    // written against NULL.
    function cfConditionSql(f, n, bindings, absent) {
        var expr = absent ? 'NULL' : 'CustomFieldById(' + f.field.alias + '.customFields, :' + n + '_id)';
        if (!absent) bindings[n + '_id'] = String(parseInt(f.field.id, 10));
        var kind = cfKind(f.field.typeId);
        var v = ':' + n + '_v', v2 = ':' + n + '_v2';
        var arity = cfOpArity(f.op);
        if (arity >= 1) bindings[n + '_v'] = String(f.value);
        if (arity === 2) bindings[n + '_v2'] = String(f.value2);

        switch (f.op) {
            case 'empty': return '(' + expr + " IS NULL OR " + expr + " = '')";
            case 'not_empty': return '(' + expr + " IS NOT NULL AND " + expr + " <> '')";
            case 'checked': return 'LOWER(' + expr + ") IN ('" + CF_TRUE.join("', '") + "')";
            case 'unchecked': return '(' + expr + ' IS NULL OR LOWER(' + expr + ") NOT IN ('" + CF_TRUE.join("', '") + "'))";
            case 'contains': return expr + " LIKE CONCAT('%', " + v + ", '%')";
            case 'not_contains': return '(' + expr + ' IS NULL OR ' + expr + " NOT LIKE CONCAT('%', " + v + ", '%'))";
            case 'starts': return expr + ' LIKE CONCAT(' + v + ", '%')";
        }
        var lhs = expr, r1 = v, r2 = v2;
        if (kind === 'number') {
            lhs = 'CAST(' + expr + ' AS DECIMAL(28,9))';
            r1 = 'CAST(' + v + ' AS DECIMAL(28,9))';
            r2 = 'CAST(' + v2 + ' AS DECIMAL(28,9))';
        } else if (kind === 'date') {
            lhs = 'DATE(' + expr + ')';
        }
        var cmp = f.op === 'between'
            ? lhs + ' >= ' + r1 + ' AND ' + lhs + ' <= ' + r2
            : lhs + ' ' + (CF_CMP[f.op] || '=') + ' ' + r1;
        if (f.op === 'ne') return '(' + expr + ' IS NULL OR ' + cmp + ')';
        // A blank number must not compare as zero.
        if (kind === 'number') return '(' + expr + " <> '' AND " + cmp + ')';
        return f.op === 'between' ? '(' + cmp + ')' : cmp;
    }

    // AND binds tighter than OR: a run of AND filters is one group, and OR
    // starts the next group.
    function cfGroups(filters) {
        var groups = [];
        filters.forEach(function (f, i) {
            if (i === 0 || f.join === 'OR') groups.push([]);
            groups[groups.length - 1].push(f);
        });
        return groups;
    }

    var CF_MARKER_RE = /\/\*cf:(select|group|where)((?:[ \t]+[A-Za-z_][A-Za-z0-9_]*)*)[ \t]*\*\//g;

    function expandCustomFields(sql, state) {
        state = state || cfState();
        var bindings = {};
        var columns = (state.columns || []).filter(cfFieldOk);
        var filters = (state.filters || []).filter(function (f) { return cfFieldOk(f.field) && cfFilterComplete(f); });

        sql = sql.replace(CF_MARKER_RE, function (m, kind, list) {
            // A marker that lists aliases says which records this part of the
            // query has. No list means it has all of them.
            var has = null;
            if (list && list.trim()) {
                has = {};
                list.trim().split(/\s+/).forEach(function (a) { has[a] = true; });
            }
            function present(alias) { return !has || has[alias] === true; }

            if (kind === 'where') {
                if (!filters.length) return '';
                var n = 0;
                var parts = cfGroups(filters).map(function (g) {
                    var conds = g.map(function (f) {
                        return cfConditionSql(f, 'cf_f' + (n++), bindings, !present(f.field.alias));
                    });
                    return conds.length > 1 ? '(' + conds.join(' AND ') + ')' : conds[0];
                });
                return '  AND (' + parts.join('\n       OR ') + ')';
            }
            var lines = [];
            columns.forEach(function (c) {
                var key = cfFieldKey(c);
                if (!present(c.alias)) {
                    // Keep the UNION branches the same width.
                    if (kind === 'select') lines.push('     , NULL AS ' + key);
                    return;
                }
                var expr = 'CustomFieldById(' + c.alias + '.customFields, :' + key + '_id)';
                bindings[key + '_id'] = String(parseInt(c.id, 10));
                lines.push('     , ' + expr + (kind === 'select' ? ' AS ' + key : ''));
            });
            return lines.join('\n');
        });
        return { sql: sql, bindings: bindings };
    }

    // The same filter, applied to a demo row.
    function cfDemoMatch(row, f) {
        var raw = row[cfFieldKey(f.field)];
        var blank = raw === undefined || raw === null || raw === '';
        var cell = blank ? '' : String(raw);
        var kind = cfKind(f.field.typeId);
        switch (f.op) {
            case 'empty': return blank;
            case 'not_empty': return !blank;
            case 'checked': return CF_TRUE.indexOf(cell.toLowerCase()) >= 0;
            case 'unchecked': return CF_TRUE.indexOf(cell.toLowerCase()) < 0;
            case 'contains': return cell.toLowerCase().indexOf(String(f.value).toLowerCase()) >= 0;
            case 'not_contains': return cell.toLowerCase().indexOf(String(f.value).toLowerCase()) < 0;
            case 'starts': return cell.toLowerCase().indexOf(String(f.value).toLowerCase()) === 0;
        }
        if (f.op === 'ne') {
            return blank || (kind === 'number' ? parseFloat(cell) !== parseFloat(f.value)
                : cell.toLowerCase() !== String(f.value).toLowerCase());
        }
        if (blank) return false;
        var a, b, c;
        if (kind === 'number') { a = parseFloat(cell); b = parseFloat(f.value); c = parseFloat(f.value2); }
        else if (kind === 'date') { a = cell.slice(0, 10); b = String(f.value); c = String(f.value2); }
        else { a = cell.toLowerCase(); b = String(f.value).toLowerCase(); c = String(f.value2 || '').toLowerCase(); }
        switch (f.op) {
            case 'eq': return a === b;
            case 'gt': return a > b;
            case 'ge': return a >= b;
            case 'lt': return a < b;
            case 'le': return a <= b;
            case 'between': return a >= b && a <= c;
        }
        return true;
    }

    // Demo rows carry every custom field as a cf_<alias>_<id> key. Apply the
    // filters, drop the fields that are not columns, and (summary reports)
    // re-sum the settings.demo_sum columns over what is left.
    function cfDemoApply(rows, state, settings) {
        if (!settings || !settings.custom_fields) return rows;
        var keep = {};
        state.columns.forEach(function (c) { keep[cfFieldKey(c)] = true; });
        var groups = cfGroups(state.filters);
        rows = (rows || []).filter(function (row) {
            if (!groups.length) return true;
            return groups.some(function (g) { return g.every(function (f) { return cfDemoMatch(row, f); }); });
        }).map(function (row) {
            var out = {};
            Object.keys(row).forEach(function (k) {
                if (!CF_KEY_RE.test(k) || keep[k]) out[k] = row[k];
            });
            return out;
        });
        var sums = settings.demo_sum;
        if (!sums || !sums.length) return rows;
        var index = {}, merged = [];
        rows.forEach(function (row) {
            var id = JSON.stringify(Object.keys(row).filter(function (k) { return sums.indexOf(k) < 0; })
                .map(function (k) { return [k, row[k]]; }));
            if (!index[id]) { index[id] = Object.assign({}, row); merged.push(index[id]); return; }
            sums.forEach(function (k) { index[id][k] = (parseFloat(index[id][k]) || 0) + (parseFloat(row[k]) || 0); });
        });
        return merged;
    }

    // The table builds its columns from the keys of the rows. A custom field
    // that is blank on every row can come back with no key at all, or with
    // the key in another letter case, and the column would then be missing.
    // Give every row every chosen column.
    function cfNormalizeRows(rows, state) {
        if (!rows || !rows.length || !state.columns.length) return rows;
        var keys = state.columns.map(cfFieldKey);
        rows.forEach(function (row) {
            var lower = null;
            keys.forEach(function (key) {
                if (key in row) return;
                if (!lower) {
                    lower = {};
                    Object.keys(row).forEach(function (k) { lower[k.toLowerCase()] = k; });
                }
                var actual = lower[key.toLowerCase()];
                if (actual !== undefined) { row[key] = row[actual]; delete row[actual]; }
                else row[key] = null;
            });
        });
        return rows;
    }

    function cfColumns(base) {
        var cols = Object.assign({}, base);
        _cf.columns.forEach(function (c) {
            cols[cfFieldKey(c)] = { label: cfFieldLabel(c), format: CF_TYPE_FORMAT[c.typeId] };
        });
        return cols;
    }

    function cfFilterText(f) {
        var t = cfFieldLabel(f.field) + ' ' + cfOpLabel(cfKind(f.field.typeId), f.op);
        var n = cfOpArity(f.op);
        if (n >= 1) t += ' ' + f.value;
        if (n === 2) t += ' and ' + f.value2;
        return t;
    }

    function cfLogicText(filters) {
        return cfGroups(filters).map(function (g) {
            var t = g.map(cfFilterText).join(' AND ');
            return g.length > 1 ? '(' + t + ')' : t;
        }).join(' OR ');
    }

    function cfSummaryText() {
        var st = cfState();
        if (!st.columns.length && !st.filters.length) return 'None';
        var parts = [];
        if (st.columns.length) parts.push('Columns: ' + st.columns.map(cfFieldLabel).join(', '));
        if (st.filters.length) parts.push('Filters: ' + cfLogicText(st.filters));
        return parts.join('. ');
    }

    function cfEl(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function renderCustomFieldsUI(settings, container) {
        if (!settings.custom_fields) return;
        var host = container.querySelector('.cp-param-fields') || container;

        var group = cfEl('div', 'mb-3 cp-span-2 cp-cf');
        group.appendChild(cfEl('label', 'form-label', 'Custom fields'));
        var bar = cfEl('div', 'd-flex align-items-center flex-wrap gap-2');
        var btn = cfEl('button', 'btn btn-outline-secondary btn-sm', 'Edit custom fields');
        btn.type = 'button';
        btn.id = 'cp-cf-toggle';
        var summary = cfEl('span', 'text-muted small');
        summary.id = 'cp-cf-summary';
        bar.appendChild(btn);
        bar.appendChild(summary);
        group.appendChild(bar);
        host.appendChild(group);

        function refresh() { summary.textContent = cfSummaryText(); }
        btn.addEventListener('click', function () { cfOpenDialog(settings, refresh); });
        refresh();
    }

    // The dialog edits a draft. Apply commits it; Cancel and Esc discard it.
    function cfOpenDialog(settings, onApply) {
        var dlg = document.getElementById('cp-cf-dialog');
        if (!dlg) {
            dlg = cfEl('dialog', 'cp-cf-dialog');
            dlg.id = 'cp-cf-dialog';
            dlg.setAttribute('aria-labelledby', 'cp-cf-title');
            document.body.appendChild(dlg);
        }
        dlg.innerHTML = '';

        var head = cfEl('div', 'cp-cf-head d-flex justify-content-between align-items-center');
        var title = cfEl('h5', 'mb-0', 'Custom fields');
        title.id = 'cp-cf-title';
        var x = cfEl('button', 'btn-close');
        x.type = 'button';
        x.setAttribute('aria-label', 'Close');
        head.appendChild(title);
        head.appendChild(x);

        var body = cfEl('div', 'cp-cf-body', 'Loading custom fields…');
        body.id = 'cp-cf-body';

        var foot = cfEl('div', 'cp-cf-foot d-flex justify-content-end align-items-center flex-wrap gap-2');
        var actions = cfEl('div', 'd-flex gap-2');
        var cancel = cfEl('button', 'btn btn-outline-secondary', 'Cancel');
        cancel.type = 'button';
        cancel.id = 'cp-cf-cancel';
        var apply = cfEl('button', 'btn btn-primary', 'Apply');
        apply.type = 'button';
        apply.id = 'cp-cf-apply';
        apply.disabled = true;
        actions.appendChild(cancel);
        actions.appendChild(apply);
        foot.appendChild(actions);

        dlg.appendChild(head);
        dlg.appendChild(body);
        dlg.appendChild(foot);

        function close() { if (dlg.open) dlg.close(); }
        x.addEventListener('click', close);
        cancel.addEventListener('click', close);
        if (!dlg.open) dlg.showModal();

        cfLoadDefinitions(settings).then(function (defs) {
            cfBuildDialogBody(body, defs, apply, function () { close(); onApply(); });
        }).catch(function (err) {
            console.error('CloudPages: custom field definitions failed:', err);
            body.innerHTML = '';
            body.appendChild(cfEl('p', 'text-danger mb-0', 'Custom fields did not load: ' + ((err && err.message) || err)));
        });
    }

    function cfBuildDialogBody(body, defs, apply, done) {
        body.innerHTML = '';
        var byKey = {};
        defs.forEach(function (d) { byKey[cfFieldKey(d)] = d; });
        // A chosen column that no longer exists is dropped.
        _cf.columns = _cf.columns.filter(function (c) { return byKey[cfFieldKey(c)]; });

        if (!defs.length) {
            body.appendChild(cfEl('p', 'text-muted mb-0', 'This report has no custom fields to add.'));
            return;
        }

        var draftCols = {};
        _cf.columns.forEach(function (c) { draftCols[cfFieldKey(c)] = true; });
        var draft = _cf.filters.filter(function (f) { return byKey[cfFieldKey(f.field)]; }).map(function (f) {
            return { join: f.join, key: cfFieldKey(f.field), op: f.op, value: f.value, value2: f.value2 };
        });

        // ---- Columns
        body.appendChild(cfEl('h6', '', 'Columns'));
        body.appendChild(cfEl('p', 'text-muted small mb-2', 'Add a field to the report as a column.'));
        var colBox = cfEl('div', 'cp-cf-cols mb-4');
        defs.forEach(function (d) {
            var key = cfFieldKey(d);
            var wrap = cfEl('div', 'form-check');
            var cb = cfEl('input', 'form-check-input');
            cb.type = 'checkbox';
            cb.id = 'cp-cf-show-' + key;
            cb.checked = !!draftCols[key];
            cb.addEventListener('change', function () { draftCols[key] = cb.checked; });
            var lab = cfEl('label', 'form-check-label', cfFieldLabel(d));
            lab.setAttribute('for', cb.id);
            wrap.appendChild(cb);
            wrap.appendChild(lab);
            colBox.appendChild(wrap);
        });
        body.appendChild(colBox);

        // ---- Filters
        body.appendChild(cfEl('h6', '', 'Filters'));
        body.appendChild(cfEl('p', 'text-muted small mb-2', 'Keep only the rows that match. AND is applied before OR.'));
        var rowsBox = cfEl('div', 'cp-cf-rows');
        rowsBox.id = 'cp-cf-rows';
        body.appendChild(rowsBox);
        var add = cfEl('button', 'btn btn-outline-secondary btn-sm mt-1', 'Add filter');
        add.type = 'button';
        add.id = 'cp-cf-add';
        body.appendChild(add);
        var logic = cfEl('p', 'small mt-3 mb-0');
        logic.id = 'cp-cf-logic';
        body.appendChild(logic);
        var error = cfEl('p', 'text-danger small mt-2 mb-0');
        error.id = 'cp-cf-error';
        error.hidden = true;
        body.appendChild(error);

        function asFilter(f) {
            return { join: f.join, field: byKey[f.key], op: f.op, value: f.value, value2: f.value2 };
        }

        function updateLogic() {
            var complete = draft.map(asFilter).filter(cfFilterComplete);
            logic.textContent = complete.length ? 'Rows where ' + cfLogicText(complete) : '';
        }

        function valueInput(f, prop, d, index) {
            var kind = cfKind(d.typeId);
            var el;
            var items = kind === 'list' && d.listId !== null ? _cf.lists[d.listId] : null;
            if (items && items.length) {
                el = cfEl('select', 'form-select form-select-sm');
                var blank = cfEl('option', '', 'Choose a value');
                blank.value = '';
                el.appendChild(blank);
                items.forEach(function (name) {
                    var o = cfEl('option', '', name);
                    o.value = name;
                    el.appendChild(o);
                });
            } else {
                el = cfEl('input', 'form-control form-control-sm');
                el.type = kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text';
                if (kind === 'number') el.step = 'any';
            }
            el.value = f[prop] === undefined || f[prop] === null ? '' : f[prop];
            el.setAttribute('aria-label', cfFieldLabel(d) + (prop === 'value2' ? ' upper value' : ' value'));
            el.setAttribute('data-cf-row', String(index));
            el.setAttribute('data-cf-prop', prop);
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function () {
                f[prop] = el.value.trim();
                el.classList.remove('is-invalid');
                updateLogic();
            });
            return el;
        }

        function renderRows() {
            rowsBox.innerHTML = '';
            if (!draft.length) rowsBox.appendChild(cfEl('p', 'text-muted small mb-2', 'No filters.'));
            draft.forEach(function (f, i) {
                var d = byKey[f.key];
                var kind = cfKind(d.typeId);
                var row = cfEl('div', 'cp-cf-row');

                var joinCell = cfEl('div', 'cp-cf-join');
                if (i === 0) {
                    joinCell.appendChild(cfEl('span', 'small text-muted', 'Where'));
                } else {
                    var join = cfEl('select', 'form-select form-select-sm');
                    join.setAttribute('aria-label', 'Combine with the filter above');
                    ['AND', 'OR'].forEach(function (j) {
                        var o = cfEl('option', '', j);
                        o.value = j;
                        join.appendChild(o);
                    });
                    join.value = f.join === 'OR' ? 'OR' : 'AND';
                    join.addEventListener('change', function () { f.join = join.value; updateLogic(); });
                    joinCell.appendChild(join);
                }

                var field = cfEl('select', 'form-select form-select-sm cp-cf-field');
                field.setAttribute('aria-label', 'Field');
                var groups = {};
                defs.forEach(function (def) {
                    var og = groups[def.tableName];
                    if (!og) {
                        og = groups[def.tableName] = document.createElement('optgroup');
                        og.label = def.tableName;
                        field.appendChild(og);
                    }
                    var o = cfEl('option', '', def.name);
                    o.value = cfFieldKey(def);
                    og.appendChild(o);
                });
                field.value = f.key;
                field.addEventListener('change', function () {
                    f.key = field.value;
                    f.op = CF_OPS[cfKind(byKey[f.key].typeId)][0][0];
                    f.value = '';
                    f.value2 = '';
                    renderRows();
                });

                var op = cfEl('select', 'form-select form-select-sm cp-cf-op');
                op.setAttribute('aria-label', 'Condition');
                CF_OPS[kind].forEach(function (o) {
                    var opt = cfEl('option', '', o[1]);
                    opt.value = o[0];
                    op.appendChild(opt);
                });
                op.value = f.op;
                op.addEventListener('change', function () { f.op = op.value; renderRows(); });

                var values = cfEl('div', 'cp-cf-values');
                var arity = cfOpArity(f.op);
                if (arity >= 1) values.appendChild(valueInput(f, 'value', d, i));
                if (arity === 2) {
                    values.appendChild(cfEl('span', 'small text-muted', 'and'));
                    values.appendChild(valueInput(f, 'value2', d, i));
                }

                var remove = cfEl('button', 'btn btn-outline-secondary btn-sm', 'Remove');
                remove.type = 'button';
                remove.setAttribute('aria-label', 'Remove this filter');
                remove.addEventListener('click', function () { draft.splice(i, 1); renderRows(); });

                row.appendChild(joinCell);
                row.appendChild(field);
                row.appendChild(op);
                row.appendChild(values);
                row.appendChild(remove);
                rowsBox.appendChild(row);
            });
            error.hidden = true;
            updateLogic();
        }

        add.addEventListener('click', function () {
            var first = defs[0];
            draft.push({ join: 'AND', key: cfFieldKey(first), op: CF_OPS[cfKind(first.typeId)][0][0], value: '', value2: '' });
            renderRows();
        });

        apply.disabled = false;
        apply.addEventListener('click', function () {
            var bad = false;
            draft.forEach(function (f, i) {
                if (cfFilterComplete(asFilter(f))) return;
                bad = true;
                var inputs = rowsBox.querySelectorAll('[data-cf-row="' + i + '"]');
                Array.prototype.forEach.call(inputs, function (el) { if (!el.value) el.classList.add('is-invalid'); });
            });
            if (bad) {
                error.textContent = 'Enter a value for each filter, or remove the filter.';
                error.hidden = false;
                return;
            }
            _cf.columns = defs.filter(function (d) { return draftCols[cfFieldKey(d)]; });
            _cf.filters = draft.map(asFilter);
            done();
        });

        renderRows();
    }

    CloudPages.customFields = {
        expand: expandCustomFields,
        state: cfState,
        summary: cfSummaryText,
        definitionsSql: CF_DEFS_SQL,
        listsSql: CF_LISTS_SQL
    };

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
        // Custom fields: the /*cf:...*/ markers are expanded from the user's
        // picks, or removed when nothing is picked. Demo keeps the SQL text
        // unchanged and applies the picks to the demo rows instead.
        var cfSt = cfState();
        var cfSettings = (_config && _config.settings) || {};
        var bound;
        if (FB.isDemo) {
            bound = { sql: sql, bindings: values };
        } else {
            var cf = expandCustomFields(sql, cfSt);
            var allValues = Object.assign({}, values, cf.bindings);
            bound = bindParams(pruneOptionalClauses(cf.sql, allValues), allValues);
        }

        FB.setStatus('Running query...');
        FB.setProgress(-1);

        // Try async first (works on all platforms)
        FB.queryAsync(bound.sql, bound.bindings).then(function (rows) {
            FB.setStatus('');
            FB.setProgress(0);
            if (FB.isDemo) rows = cfDemoApply(rows, cfSt, cfSettings);
            rows = cfNormalizeRows(rows, cfSt);
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
            if (demo.custom_fields) queries[CF_DEFS_SQL] = demo.custom_fields;
            if (demo.custom_lists) queries[CF_LISTS_SQL] = demo.custom_lists;
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
            renderCustomFieldsUI(config.settings, paramContainer);
        }

        // Submit button
        var submitBtn = document.getElementById('submitButton');
        if (submitBtn) {
            submitBtn.addEventListener('click', function () {
                if (!validateParameters(config.parameters)) return;

                var values = collectValues(config.parameters);
                _lastRunMeta = {
                    title: config.settings.title || document.title || 'Report',
                    timestamp: new Date().toLocaleString(),
                    params: parameterSummary(config.parameters)
                };
                if (config.settings.custom_fields) {
                    _lastRunMeta.params.push({ label: 'Custom fields', value: cfSummaryText() });
                }
                executeQuery(config.query, values, function (err, rows) {
                    if (err) {
                        console.error('CloudPages: query error:', err);
                        var container = document.getElementById('tableContainer');
                        if (container) container.innerHTML = '<p class="text-danger">Query error: ' + (err.message || err) + '</p>';
                        return;
                    }
                    renderTable(rows, cfColumns(config.columns), config.settings);
                    var panel = document.querySelector('.cp-param-panel');
                    if (panel) panel.open = false;
                });
            });
        }

        // Export buttons: the legacy single #exportBtn is upgraded in place to
        // [Export XLSX |v] [Export CSV |v] [Markdown] — the carats open a small
        // options popup (filename, include-parameters) for that format.
        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) buildExportUI(exportBtn, config.settings);

        // Load on open
        if (config.settings.load_on_open && submitBtn) {
            submitBtn.click();
        }

        applyTheme(currentThemePref(config.settings));
        buildControls(config.settings);
    }

    // Per-format defaults: the parameters record rides along everywhere except
    // CSV, where flat data is the point (comment lines are opt-in).
    var EXPORT_FORMATS = {
        xlsx: { label: 'Export XLSX', fn: exportXLSX, includeParamsDefault: true,
                paramsHint: 'Add a Parameters sheet' },
        csv:  { label: 'Export CSV', fn: exportCSV, includeParamsDefault: false,
                paramsHint: 'Add parameter comment lines (# …) above the header' },
        markdown: { label: 'Markdown', fn: exportMarkdown, includeParamsDefault: true,
                paramsHint: 'Add a parameters section' }
    };

    function defaultFilename(settings) {
        return ((settings && settings.title) || document.title || 'Report')
            .replace(/[\\/:*?"<>|]+/g, '-');
    }

    function buildExportUI(legacyBtn, settings) {
        var group = document.createElement('div');
        group.className = 'cp-export-group';

        function runExport(format, opts) {
            if (!_lastResultRows.length) return;
            var f = EXPORT_FORMATS[format];
            var name = (opts && opts.filename) || defaultFilename(settings);
            f.fn(_lastResultRows, name, {
                includeParams: opts && 'includeParams' in opts ? opts.includeParams : f.includeParamsDefault
            });
        }

        // Options popup (one shared instance, per-format on open)
        var pop = document.createElement('div');
        pop.className = 'cp-export-options';
        pop.hidden = true;
        pop.innerHTML =
            '<div class="mb-2"><label class="form-label mb-1">File name</label>' +
            '<input type="text" class="form-control form-control-sm" id="cp-eo-name"></div>' +
            '<label class="form-check mb-2"><input type="checkbox" class="form-check-input" id="cp-eo-params"> ' +
            '<span class="form-check-label" id="cp-eo-params-hint">Include parameters</span></label>' +
            '<button type="button" class="btn btn-sm btn-primary w-100" id="cp-eo-go">Export</button>';
        var popFormat = 'xlsx';
        function openOptions(format, anchor) {
            popFormat = format;
            var f = EXPORT_FORMATS[format];
            pop.querySelector('#cp-eo-name').value = defaultFilename(settings);
            pop.querySelector('#cp-eo-params').checked = f.includeParamsDefault;
            pop.querySelector('#cp-eo-params-hint').textContent = f.paramsHint;
            pop.hidden = false;
            pop.style.left = anchor.offsetLeft + 'px';
        }
        pop.querySelector('#cp-eo-go').addEventListener('click', function () {
            runExport(popFormat, {
                filename: pop.querySelector('#cp-eo-name').value.trim() || defaultFilename(settings),
                includeParams: pop.querySelector('#cp-eo-params').checked
            });
            pop.hidden = true;
        });
        document.addEventListener('click', function (e) {
            if (!pop.hidden && !group.contains(e.target)) pop.hidden = true;
        });

        function addSplit(format) {
            var f = EXPORT_FORMATS[format];
            var wrap = document.createElement('div');
            wrap.className = 'btn-group cp-export-split';
            var main = document.createElement('button');
            main.type = 'button';
            main.className = 'btn btn-secondary';
            main.textContent = f.label;
            main.addEventListener('click', function () { pop.hidden = true; runExport(format); });
            var caret = document.createElement('button');
            caret.type = 'button';
            caret.className = 'btn btn-secondary dropdown-toggle dropdown-toggle-split';
            caret.title = f.label + ' with options\u2026';
            caret.setAttribute('aria-label', f.label + ' with options');
            caret.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!pop.hidden && popFormat === format) { pop.hidden = true; return; }
                openOptions(format, wrap);
            });
            wrap.appendChild(main);
            wrap.appendChild(caret);
            group.appendChild(wrap);
        }

        if (settings.enable_xlsx_export) addSplit('xlsx');
        if (settings.enable_csv_export) addSplit('csv');
        if (settings.enable_markdown_export) {
            var md = document.createElement('button');
            md.type = 'button';
            md.className = 'btn btn-outline-secondary';
            md.textContent = 'Markdown';
            md.addEventListener('click', function () { pop.hidden = true; runExport('markdown'); });
            group.appendChild(md);
        }
        group.appendChild(pop);
        legacyBtn.parentNode.replaceChild(group, legacyBtn);
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
    CloudPages.exportMarkdown = exportMarkdown;
    CloudPages.snakeToTitle = snakeToTitle;
    CloudPages.registerRenderer = registerRenderer;

    window.CloudPages = CloudPages;

})(window, jQuery);
