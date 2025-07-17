/**
 * Fishbowl CloudPages Utility Functions
 * Common utilities for Fishbowl HTML/JS applications
 */

/**
 * Core database query wrapper utility
 * @param {string} sql - SQL query string
 * @param {object} params - Optional parameters object
 * @returns {object} Query results or error object
 */
function fb_query(sql, params) {
    try {
        if (sql && params) {
            var param_json = JSON.stringify(params);
            return JSON.parse(fb_client.runQueryParameters(sql, param_json));
        } else if (sql) {
            return JSON.parse(fb_client.runQuery(sql));
        }
        return {};
    } catch (error) {
        fb_client.logError('fb_query error: ' + error.message);
        return { is_error: true, error_msg: error.message };
    }
}

/**
 * Safe query execution with error handling
 * @param {string} sql - SQL query string
 * @param {object} params - Optional parameters object
 * @returns {object|null} Query results or null on error
 */
function safeQuery(sql, params) {
    try {
        const results = fb_query(sql, params);
        
        if (results.is_error) {
            fb_client.logError('Query failed: ' + results.error_msg);
            return null;
        }
        
        return results;
    } catch (error) {
        fb_client.logError('Error executing query: ' + error.message);
        return null;
    }
}

/**
 * Check if a string is empty or null
 * @param {string} str - String to check
 * @returns {boolean} True if empty or null
 */
function isEmpty(str) {
    return !str || str.length === 0;
}

/**
 * StringBuilder utility for efficient string concatenation
 * @param {string} value - Initial value
 */
function StringBuilder(value) {
    this.strings = new Array();
    if (value) this.strings.push(value);
    
    this.append = function(value) {
        if (value) this.strings.push(value);
    };
    
    this.toString = function() {
        return this.strings.join("");
    };
}

/**
 * Get current month start and end dates
 * @returns {object} Object with start and end date strings
 */
function getCurrentStartEndMonth() {
    var current_date = new Date();
    var y = current_date.getFullYear();
    var m = current_date.getMonth();
    return {
        start: new Date(y, m, 1).toISOString().slice(0, 10),
        end: new Date(y, m + 1, 0).toISOString().slice(0, 10)
    };
}

/**
 * Safe division that handles zero denominators
 * @param {number} numerator - Numerator
 * @param {number} denominator - Denominator
 * @returns {number} Result or 0 if invalid
 */
function divideIfNotZero(numerator, denominator) {
    if (denominator === 0 || isNaN(denominator)) return 0;
    if (numerator === 0 || isNaN(numerator)) return 0;
    return numerator / denominator;
}

/**
 * Format number as currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: $)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = '$') {
    if (isNaN(amount)) return currency + '0.00';
    return currency + parseFloat(amount).toFixed(2);
}

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
    if (isNaN(num)) return '0';
    return parseFloat(num).toLocaleString();
}

/**
 * Show status message with auto-hide
 * @param {string} message - Status message
 * @param {string} type - Message type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds (default: 5000)
 */
function showStatus(message, type, duration = 5000) {
    const statusDiv = document.getElementById('statusMessage');
    if (!statusDiv) return;
    
    statusDiv.textContent = message;
    statusDiv.className = `status-message status-${type}`;
    statusDiv.style.display = 'block';
    
    // Auto-hide after duration for non-error messages
    if (type !== 'error' && duration > 0) {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, duration);
    }
}

/**
 * Update progress bar and status
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Status message
 */
function updateProgress(percent, message) {
    try {
        fb_client.pbUpdate(percent);
        if (message) {
            fb_client.dialogStatus(message);
        }
    } catch (error) {
        console.log('Progress update failed:', error);
    }
}

/**
 * Safe user preference getter
 * @param {string} group - Preference group
 * @param {string} key - Preference key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Preference value or default
 */
function getUserPreference(group, key, defaultValue) {
    try {
        const value = fb_client.getPluginData(group, key);
        return value !== null ? value : defaultValue;
    } catch (error) {
        console.log('Could not get user preference:', error);
        return defaultValue;
    }
}

/**
 * Safe user preference setter
 * @param {string} group - Preference group
 * @param {object} data - Data object to save
 * @returns {boolean} Success status
 */
function setUserPreference(group, data) {
    try {
        fb_client.savePluginDataByGroup(group, JSON.stringify(data));
        return true;
    } catch (error) {
        console.log('Could not save user preference:', error);
        return false;
    }
}

/**
 * Export data to CSV
 * @param {Array} data - Array of objects to export
 * @param {Array} headers - Array of header names
 * @param {string} filename - Output filename
 */
function exportToCSV(data, headers, filename) {
    if (!data || data.length === 0) {
        showStatus('No data to export', 'warning');
        return;
    }
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            // Escape quotes and wrap in quotes if contains comma
            return typeof value === 'string' && value.includes(',') ? 
                `"${value.replace(/"/g, '""')}"` : value;
        });
        csvContent += values.join(',') + '\n';
    });
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showStatus('Data exported successfully', 'success');
}

/**
 * Validate required form fields
 * @param {Array} fieldIds - Array of field IDs to validate
 * @returns {boolean} True if all fields are valid
 */
function validateRequiredFields(fieldIds) {
    let isValid = true;
    
    fieldIds.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        if (!field.value || field.value.trim() === '') {
            field.classList.add('is-invalid');
            isValid = false;
        } else {
            field.classList.remove('is-invalid');
        }
    });
    
    return isValid;
}

/**
 * Clear form validation states
 * @param {Array} fieldIds - Array of field IDs to clear
 */
function clearValidation(fieldIds) {
    fieldIds.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.remove('is-invalid');
        }
    });
}

/**
 * Debounce function for search inputs
 * @param {function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {function} Debounced function
 */
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (default: 'MM/dd/yyyy')
 * @returns {string} Formatted date string
 */
function formatDate(date, format = 'MM/dd/yyyy') {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return format
        .replace('yyyy', year)
        .replace('MM', month)
        .replace('dd', day);
}

/**
 * Generate unique ID
 * @returns {string} Unique ID string
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Initialize common functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Add Bootstrap validation classes
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!form.checkValidity()) {
                e.preventDefault();
                e.stopPropagation();
            }
            form.classList.add('was-validated');
        });
    });
    
    // Add enter key support for search fields
    const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="search"]');
    searchInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const runButton = document.getElementById('runReport') || 
                                document.getElementById('search') || 
                                document.querySelector('button[type="submit"]');
                if (runButton) runButton.click();
            }
        });
    });
});