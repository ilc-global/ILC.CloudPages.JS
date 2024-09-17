// Common helper functions

function createFormGroup(key, parameter) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const labelElement = document.createElement('label');
    labelElement.textContent = parameter.label;
    if (parameter.required) {
        const asterisk = document.createElement('span');
        asterisk.textContent = '*';
        asterisk.className = 'required-asterisk';
        labelElement.appendChild(asterisk);
    }
    formGroup.appendChild(labelElement);

    let inputElement;
    switch (parameter.type) {
        case 'date':
        case 'time':
        case 'timestamp':
        case 'int':
        case 'pct':
        case 'amt':
            if (parameter.mode === 'range') {
                formGroup.appendChild(createRangeInput(key, parameter));
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', parameter.type === 'timestamp' ? 'datetime-local' : parameter.type);
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key);
                formGroup.appendChild(inputElement);
            }
            break;
        case 'combobox':
            inputElement = createComboBox(key, parameter);
            formGroup.appendChild(inputElement);
            if (parameter.mode === 'multi') {
                const helperText = document.createElement('label');
                helperText.textContent = 'Control-click to multi-select';
                helperText.className = 'helper-text';
                formGroup.appendChild(helperText);
            }
            break;
        case 'checkbox':
            inputElement = createCheckBox(key, parameter);
            formGroup.appendChild(inputElement);
            break;
        case 'autocomplete':
            inputElement = createAutocomplete(key, parameter);
            formGroup.appendChild(inputElement);
            break;
        default:
            inputElement = document.createElement('input');
            inputElement.setAttribute('type', 'text');
            inputElement.className = 'form-control';
            inputElement.setAttribute('id', key);
            formGroup.appendChild(inputElement);
    }

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}

function createRangeInput(key, parameter) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const startInput = document.createElement('input');
    startInput.setAttribute('type', 'text');
    startInput.className = 'form-control';
    startInput.setAttribute('id', key + '_start');
    formGroup.appendChild(startInput);

    const toLabel = document.createElement('span');
    toLabel.className = 'range-divider';
    toLabel.textContent = ' to ';
    formGroup.appendChild(toLabel);

    const endInput = document.createElement('input');
    endInput.setAttribute('type', 'text');
    endInput.className = 'form-control';
    endInput.setAttribute('id', key + '_end');
    formGroup.appendChild(endInput);

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}

// Function to create a combo box
function createComboBox(key, parameter) {
    const selectElement = document.createElement('select');
    selectElement.className = 'form-control';
    if (parameter.mode === 'multi') {
        selectElement.setAttribute('multiple', 'multiple');
    } else {
        const placeholderOption = document.createElement('option');
        placeholderOption.text = 'Select an Option';
        placeholderOption.value = '';
        selectElement.add(placeholderOption);
    }

    parameter.data.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option[parameter.value];
        optionElement.text = option[parameter.display];
        selectElement.add(optionElement);
    });

    return selectElement;
}

// Function to create checkboxes
function createCheckBox(key, parameter) {
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'checkbox-container';

    parameter.data.forEach(option => {
        const checkboxLabel = document.createElement('label');
        checkboxLabel.textContent = option[parameter.display];

        const checkboxElement = document.createElement('input');
        checkboxElement.setAttribute('type', 'checkbox');
        checkboxElement.setAttribute('name', key);
        checkboxElement.setAttribute('value', option[parameter.value]);

        if (parameter.mode === 'single') {
            checkboxElement.addEventListener('change', (e) => {
                document.querySelectorAll(`input[name=${key}]`).forEach(cb => {
                    if (cb !== e.target) cb.checked = false;
                });
            });
        }

        checkboxLabel.appendChild(checkboxElement);
        checkboxContainer.appendChild(checkboxLabel);
    });

    return checkboxContainer;
}

// Function to create autocomplete
function createAutocomplete(key, parameter) {
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocomplete-container';

    const autocompleteInput = document.createElement('input');
    autocompleteInput.setAttribute('type', 'text');
    autocompleteInput.setAttribute('id', key);
    autocompleteInput.className = 'form-control';
    autocompleteInput.setAttribute('placeholder', 'Type to search...');
    autocompleteContainer.appendChild(autocompleteInput);

    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'autocomplete-results';
    autocompleteContainer.appendChild(resultsContainer);

    /* //single selection
    autocompleteInput.addEventListener('input', function(event) {
        const inputValue = this.value.trim().toLowerCase();
        const query = parameter.sql.query.replace('@input', inputValue);
        const results = JSON.parse(fb_client.runQuery(query));
        performAutocompleteSearch(key, parameter, inputValue, results, resultsContainer, autocompleteInput);
    }); */

// Handle multi-selection if parameter.mode === 'multi'
if (parameter.mode === 'multi') {
    const selectedItemsContainer = document.createElement('div');
    selectedItemsContainer.className = 'selected-items';
    autocompleteContainer.appendChild(selectedItemsContainer);

    autocompleteInput.addEventListener('input', function(event) {
        const inputValue = this.value.trim().toLowerCase();
        const query = parameter.sql.query ? parameter.sql.query.replace('@input', inputValue) : parameter.sql;
        const results = JSON.parse(fb_client.runQuery(query));
        performAutocompleteSearch(key, parameter, inputValue, results, resultsContainer, autocompleteInput, selectedItemsContainer);
    });
} else {
    // Single selection mode
    autocompleteInput.addEventListener('input', function(event) {
        const inputValue = this.value.trim().toLowerCase();
        const query = parameter.sql.query ? parameter.sql.query.replace('@input', inputValue) : parameter.sql;
        const results = JSON.parse(fb_client.runQuery(query));
        performAutocompleteSearch(key, parameter, inputValue, results, resultsContainer, autocompleteInput);
    });
}

// Handle keyboard navigation for arrow keys and selection
autocompleteInput.addEventListener('keydown', function(event) {
    const results = resultsContainer.children;
    if (event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % results.length;
        updateResultsHighlight(results);
    } else if (event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + results.length) % results.length;
        updateResultsHighlight(results);
    } else if (event.key === 'Enter') {
        event.preventDefault(); 
        if (results[selectedIndex]) {
            if (parameter.mode === 'multi') {
                addSelectedItem(key, parameter, results[selectedIndex], autocompleteInput, resultsContainer, selectedItemsContainer);
            } else {
                autocompleteInput.value = results[selectedIndex].innerText;
            }
            clearResults(resultsContainer);
        }
    } else if (event.key === 'Tab') {
        event.preventDefault();
        if (results.length > 0) {
            selectedIndex = (selectedIndex + 1) % results.length;
            updateResultsHighlight(results, selectedIndex);
        }
    }
});

// Clear results if clicking outside the autocomplete container
document.addEventListener('click', function(event) {
    if (!autocompleteContainer.contains(event.target)) {
        clearResults(resultsContainer);
    }
});

    return autocompleteContainer;
}

function performAutocompleteSearch(key, parameter, inputValue, results, resultsContainer, autocompleteInput) {
    clearResults(resultsContainer);
    const matchedResults = results.filter(result => parameter.search.split(',').some(field => result[field.trim()].toString().toLowerCase().includes(inputValue)));
    if (inputValue.length >= 1 && matchedResults.length > 0) {
        resultsContainer.style.display = 'block';
        matchedResults.forEach(result => {
            const resultItem = document.createElement('div');
            resultItem.textContent = parameter.display.split(',').map(field => result[field.trim()]).join(', ');
            resultItem.setAttribute('data-value', result[parameter.value]);
            resultItem.addEventListener('click', function() {
                autocompleteInput.value = resultItem.textContent;
                autocompleteInput.setAttribute('data-value', resultItem.getAttribute('data-value'));
                clearResults(resultsContainer);
            });
            resultsContainer.appendChild(resultItem);
        });
    } else {
        resultsContainer.style.display = 'none';
    }
}

function clearResults(resultsContainer) {
    while (resultsContainer.firstChild) {
        resultsContainer.removeChild(resultsContainer.firstChild);
    }
    resultsContainer.style.display = 'none';
}

// Validation functions

function validateForm(parameters) {
    let isValid = true;
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        if (parameter.required) {
            const element = document.getElementById(key);
            const errorElement = document.getElementById(key + '_error');
            if (!element.value.trim()) {
                errorElement.textContent = 'This field is required.';
                isValid = false;
            } else {
                errorElement.textContent = '';
            }
        }
    });
    return isValid;
}

// Form submission handler
function handleSubmit(parameters) {
    if (!validateForm(parameters)) {
        return;
    }
    const formData = collectFormData(parameters);
    console.log('Form Data:', formData);
    document.getElementById('submitMessage').textContent = 'Form submitted successfully!';
}

function collectFormData(parameters) {
    const formData = {};
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        if (parameter.type === 'checkbox') {
            formData[key] = Array.from(document.querySelectorAll(`input[name=${key}]:checked`)).map(cb => cb.value).join(',');
        } else {
            formData[key] = document.getElementById(key).value;
        }
    });
    return formData;
}

// Form initialization
function initForm() {
//const parameters = JSON.parse(document.getElementById('parameters').innerHTML.trim());
    // Log the #parameters element's text content
    const parametersElement = document.getElementById('parameter'); //changed
    
    // Check if the #parameters element exists
    if (!parametersElement) {
        console.error('Parameters element not found');
        return; // Exit if the element isn't found
    }

// Get the JSON content from the <script> tag
const parametersText = parametersElement.textContent.trim();
    // Check if the content is empty
    if (!parametersText) {
        console.error('Parameters script element is empty');
        return; // Exit if the JSON content is empty
    }

    console.log('Parameters Text:', parametersText);

    let parameters;
    try {
        parameters = JSON.parse(parametersText);
        console.log('Parsed Parameters:', parameters);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return; // Exit if there's a parsing error
    }
    const parametersContainer = document.getElementById('parametersContainer');
    
    Object.keys(parameters).forEach(key => {
        const formGroup = createFormGroup(key, parameters[key]);
        parametersContainer.appendChild(formGroup);
    });

    document.getElementById('submitButton').addEventListener('click', function () {
        handleSubmit(parameters);
    });
}

document.addEventListener('DOMContentLoaded', initForm);
