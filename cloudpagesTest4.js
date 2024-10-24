function validateParameters(parameters) {
    let isValid = true;

    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        const element = document.getElementById(key);
        const errorElement = document.getElementById(key + '_error');

        if (element) {
            if (!errorElement) {
                const newErrorElement = document.createElement('div');
                newErrorElement.setAttribute('id', key + '_error');
                newErrorElement.className = 'text-danger';
                element.parentNode.appendChild(newErrorElement);
            } else {
                errorElement.textContent = '';
            }

            if (parameter.required && (!element.value || element.value === 'Select an option')) {
                const newErrorElement = document.getElementById(key + '_error');
                newErrorElement.textContent = `${parameter.label} is required.`;
                isValid = false;
            }       
        }
    });

    return isValid;
}

function collectParameterValues(parameters) {
    const values = {};

    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        const element = document.getElementById(key);

        if (element) {
            if (parameter.type === 'dropdown' && parameter.mode === 'multi') {
                const selectedOptions = Array.from(element.selectedOptions).map(option => option.value);
                values[key] = selectedOptions.filter(value => value !== 'Select an option');
            } else if (parameter.type === 'checkbox') {
                const checkboxes = document.querySelectorAll(`#${key} input[type="checkbox"]`);
                const checkedValues = Array.from(checkboxes).filter(checkbox => checkbox.checked).map(checkbox => checkbox.value);
                values[key] = checkedValues.length > 0 ? checkedValues : undefined;
            } else if (parameter.type === 'dropdown') {
                values[key] = element.value !== 'Select an option' ? element.value : undefined;
            } else if (parameter.type === 'autocomplete') {
                values[key] = element.dataset.id || undefined;
            } else {
                values[key] = element.value;
            }
        }
    });
    return values;
}
function createFormGroup(key, parameter) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    // Create and append label element
    const labelElement = document.createElement('label');
    labelElement.textContent = parameter.label;
    if (parameter.required) {
        const asterisk = document.createElement('span');
        asterisk.textContent = '*';
        asterisk.className = 'required-asterisk';
        labelElement.appendChild(asterisk);
    }
    formGroup.appendChild(labelElement);

    // Create input/select/textarea element based on parameter type
    let inputElement;
    switch (parameter.type) {
        case 'date':
            if (parameter.mode === 'range') {
                formGroup.appendChild(createRangeDateInput(key));
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'date');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
                formGroup.appendChild(inputElement);
            }
            break;
        case 'time':
            if (parameter.mode === 'range') {
                formGroup.appendChild(createRangeTimeInput(key));
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'time');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
                formGroup.appendChild(inputElement);
            }
            break;
        case 'timestamp':
            if (parameter.mode === 'range') {
                formGroup.appendChild(createRangeTimestampInput(key));
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'datetime-local');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
                formGroup.appendChild(inputElement);
            }
            break;
        case 'int':
        case 'pct':
        case 'amt':
            if (parameter.mode === 'range') {
                formGroup.appendChild(createRangeInput(key, parameter));
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'text');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
                formGroup.appendChild(inputElement);
            }
            break;
        case 'dropdown':
            inputElement = createDropdown(key, parameter);
            inputElement.setAttribute('id', key); // Set id for select element
            formGroup.appendChild(inputElement);
            if (parameter.mode === 'multi') {
                const helperText = document.createElement('label');
                helperText.textContent = 'Control-click to multi-select';
                helperText.className = 'helper-text'; // class for styling 
                formGroup.appendChild(helperText);
            }
            break;
        case 'checkbox':
            inputElement = createCheckBox(key, parameter);
            formGroup.appendChild(inputElement);
            break;
        case 'autocomplete':
            inputElement = createAutocomplete(key, parameter);
            formGroup.appendChild(inputElement);  // Ensure it's appended to the formGroup or another valid container
            break;
    
        default:
            inputElement = document.createElement('input');
            inputElement.setAttribute('type', 'text');
            inputElement.className = 'form-control';
            inputElement.setAttribute('id', key); // Set id for input element
            formGroup.appendChild(inputElement);
    }

    // Create and append error message span
    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}
function createRangeInput(key, parameter) { //look over
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
function createRangeDateInput(key) {
    // Create a div to hold both date inputs in one line
    const dateRangeGroup = document.createElement('div');
    dateRangeGroup.className = 'date-range-group'; // Add a class for styling

    // Create the start date input
    const startDateInput = document.createElement('input');
    startDateInput.setAttribute('type', 'date');
    startDateInput.className = 'form-control';
    startDateInput.setAttribute('id', key + '_start'); // Unique ID for start date

    // Create the end date input
    const endDateInput = document.createElement('input');
    endDateInput.setAttribute('type', 'date');
    endDateInput.className = 'form-control';
    endDateInput.setAttribute('id', key + '_end'); // Unique ID for end date

    // Append both inputs to the date range group
    dateRangeGroup.appendChild(startDateInput);
    dateRangeGroup.appendChild(document.createTextNode(' to ')); // Text between inputs
    dateRangeGroup.appendChild(endDateInput);

    return dateRangeGroup;
}

function createRangeTimeInput(key) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const startInput = document.createElement('input');
    startInput.setAttribute('type', 'time');
    startInput.className = 'form-control';
    startInput.setAttribute('id', key + '_start');
    formGroup.appendChild(startInput);

    const toLabel = document.createElement('span');
    toLabel.className = 'range-divider';
    toLabel.textContent = ' to ';
    formGroup.appendChild(toLabel);

    const endInput = document.createElement('input');
    endInput.setAttribute('type', 'time');
    endInput.className = 'form-control';
    endInput.setAttribute('id', key + '_end');
    formGroup.appendChild(endInput);

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}
function createRangeTimeInput(key) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const startInput = document.createElement('input');
    startInput.setAttribute('type', 'time');
    startInput.className = 'form-control';
    startInput.setAttribute('id', key + '_start');
    formGroup.appendChild(startInput);

    const toLabel = document.createElement('span');
    toLabel.className = 'range-divider';
    toLabel.textContent = ' to ';
    formGroup.appendChild(toLabel);

    const endInput = document.createElement('input');
    endInput.setAttribute('type', 'time');
    endInput.className = 'form-control';
    endInput.setAttribute('id', key + '_end');
    formGroup.appendChild(endInput);

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}

function createDropdown(key, parameter) {
    const dropdown = document.createElement('select');
    dropdown.className = 'form-control';
    dropdown.setAttribute('id', key);
    if (parameter.required) {
        dropdown.setAttribute('required', 'required');
    }
    if (parameter.mode === 'multi') {
        dropdown.setAttribute('multiple', 'multiple');
    }

    const defaultOption = document.createElement('option');
    defaultOption.textContent = 'Select an option';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    defaultOption.setAttribute('value', '');
    dropdown.appendChild(defaultOption);

    var results = fb_client.runQuery(parameter.sql);
    var results_obj = JSON.parse(results);

    results_obj.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.setAttribute('value', option[parameter.value]);
        optionElement.textContent = `${option.name}, ${option.description}`;
        dropdown.appendChild(optionElement);
    });

    return dropdown;
}
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

    // Event listener to handle input and trigger SQL query
    autocompleteInput.addEventListener('input', function (event) {
        const inputValue = this.value.trim().toLowerCase();
        console.log(`User Input: ${inputValue}`);  // Debugging input value

        /*if (inputValue.length >= parameter.minChars) {
            try {
                // Modify SQL and execute it using fb_client
                const query = parameter.sql.replace('@input', inputValue);
                console.log(`Executing Query: ${query}`);  // Debugging query
                const results = fb_client.runQuery(query);  // Execute the SQL query

                const resultsObj = JSON.parse(results);
                console.log(`Query Results: ${results}`);  // Debugging query results

                performAutocompleteSearch(key, parameter, inputValue, resultsObj, resultsContainer, autocompleteInput);
            } catch (error) {
                console.error('Error executing SQL query: ', error);  // Log any query errors
            }
        } else {
            clearAutocompleteResults(resultsContainer);
        }

        selectedIndex = -1; // Reset the selected index when the input changes
    });*/
    if (inputValue.length >= parameter.minChars) {
        try {
            // Modify SQL and execute it using fb_client
            const query = parameter.sql.replace('@input', inputValue);
            console.log(`Executing Query: ${query}`);  // Debugging query
            const results = fb_client.runQuery(query);  // Execute the SQL query

            const resultsObj = JSON.parse(results);
            console.log(`Query Results: ${resultsObj}`);  // Debugging query results

            // Clear previous results
            resultsContainer.innerHTML = '';

            // Render results
            resultsObj.forEach(result => {
                const resultItem = document.createElement('div');
                resultItem.textContent = `${result[parameter.displayField]} - ${result[parameter.valueField]}`;
                resultItem.className = 'result-item';
                resultsContainer.appendChild(resultItem);

                // Optional: Add event listener to handle selecting a result
                resultItem.addEventListener('click', () => {
                    autocompleteInput.value = result[parameter.displayField];
                    autocompleteInput.dataset.id = result[parameter.valueField];  // Store the selected ID
                    resultsContainer.innerHTML = '';  // Clear results after selection
                });
            });
            renderTable(resultsObj, 'results-table-container');  // Specify the table container's ID
        } catch (error) {
            console.error(`Error executing query: ${error.message}`);
        }
    }
});

    autocompleteInput.addEventListener('keydown', function (event) {
        const results = resultsContainer.children;
        if (event.key === 'ArrowDown') {
            selectedIndex = (selectedIndex + 1) % results.length;
            updateHighlight(results, selectedIndex);
        } else if (event.key === 'ArrowUp') {
            selectedIndex = (selectedIndex - 1 + results.length) % results.length;
            updateHighlight(results, selectedIndex);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (results.length > 0 && selectedIndex >= 0) {
                const selectedItem = results[selectedIndex];
                autocompleteInput.value = selectedItem.textContent;
                autocompleteInput.dataset.id = selectedItem.dataset.id;
                clearAutocompleteResults(resultsContainer);
            }
        }
    });

    return autocompleteContainer;
}

//funtion to handle autocomeplete search adn display results
function performAutocompleteSearch(key, parameter, inputValue, results_obj, resultsContainer, inputElement) {
    const filteredData = results_obj.filter(option =>
        option[parameter.search].toLowerCase().includes(inputValue)
    );

    clearAutocompleteResults(resultsContainer);

    if (filteredData.length > 0) {
        filteredData.forEach(option => {
            const resultItem = document.createElement('div');
            resultItem.textContent = `${option.name}, ${option.description}`;
            resultItem.dataset.id = option[parameter.value];
            resultItem.addEventListener('click', function () {
                inputElement.value = `${option.name}, ${option.description}`;
                inputElement.dataset.id = option[parameter.value];
                clearAutocompleteResults(resultsContainer);
            });
            resultsContainer.appendChild(resultItem);
        });

        resultsContainer.style.display = 'block';
    }
}

function updateHighlight(results, selectedIndex) {
    Array.from(results).forEach((result, index) => {
        if (index === selectedIndex) {
            result.classList.add('highlight');
        } else {
            result.classList.remove('highlight');
        }
    });
}

function addSelectedItem(key, resultItem, autocompleteInput, resultsContainer, selectedItemsContainer) {
    const selectedItem = document.createElement('span');
    selectedItem.className = 'selected-item';
    selectedItem.textContent = resultItem.textContent;
    selectedItem.setAttribute('data-value', resultItem.getAttribute('data-value'));

    const removeItem = document.createElement('span');
    removeItem.className = 'remove-item';
    removeItem.textContent = 'x';
    removeItem.addEventListener('click', function() {
        selectedItemsContainer.removeChild(selectedItem);
    });

    selectedItem.appendChild(removeItem);
    selectedItemsContainer.appendChild(selectedItem);

    autocompleteInput.value = '';
    clearResults(resultsContainer);
}
function clearAutocompleteResults(resultsContainer) {
    while (resultsContainer.firstChild) {
        resultsContainer.removeChild(resultsContainer.firstChild);
    }
    resultsContainer.style.display = 'none';
}
function handleSubmit(parameters) {
    if (!validateParameters(parameters)) {
        console.log('Form validation failed');
        return;
    }

    const formData = {};
    const orderedFormData = {};

    function renderTable(resultsObj, tableContainerId) {
        const tableContainer = document.getElementById(tableContainerId);
    
        // Clear any previous table
        tableContainer.innerHTML = '';
    
        // Create table and header row
        const table = document.createElement('table');
        table.className = 'table table-bordered';
    
        const headerRow = document.createElement('tr');
        const headers = Object.keys(resultsObj[0]);  // Assuming resultsObj is an array of objects
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
    
        // Populate rows
        resultsObj.forEach(result => {
            const row = document.createElement('tr');
            headers.forEach(header => {
                const td = document.createElement('td');
                td.textContent = result[header];
                row.appendChild(td);
            });
            table.appendChild(row);
        });
    
        // Append table to container
        tableContainer.appendChild(table);
    }
    
// Collect form data
Object.keys(parameters).forEach(key => {
    const parameter = parameters[key];

    if (parameter.type === 'checkbox' && parameter.mode === 'multi') {
        const value = Array.from(document.querySelectorAll(`input[name=${key}]:checked`)).map(cb => cb.value);
        formData[key] = value.join(','); // Join values into a comma-separated string
    } else if (parameter.type === 'checkbox' && parameter.mode === 'single') {
        const selectedCheckbox = document.querySelector(`input[name=${key}]:checked`);
        formData[key] = selectedCheckbox ? selectedCheckbox.value : null;
    } else if (parameter.type === 'dropdown' && parameter.mode === 'multi') {
        const value = Array.from(document.getElementById(key).selectedOptions).map(option => option.value);
        formData[key] = value.join(','); // Join values into a comma-separated string
    } else if (parameter.type === 'dropdown' && parameter.mode === 'single') {
        formData[key] = document.getElementById(key).value;
    } else if (parameter.type === 'date' && parameter.mode === 'range') {
        formData[key + '_start'] = document.getElementById(key + '_start').value;
        formData[key + '_end'] = document.getElementById(key + '_end').value;
    } else if (parameter.type === 'time' && parameter.mode === 'range') {
        formData[key + '_start'] = document.getElementById(key + '_start').value;
        formData[key + '_end'] = document.getElementById(key + '_end').value;
    } else if (parameter.type === 'timestamp' && parameter.mode === 'range') {
        formData[key + '_start'] = document.getElementById(key + '_start').value;
        formData[key + '_end'] = document.getElementById(key + '_end').value;
    } else if ((parameter.type === 'int' || parameter.type === 'pct' || parameter.type === 'amt') && parameter.mode === 'range') {
        formData[key + '_start'] = document.getElementById(key + '_start').value;
        formData[key + '_end'] = document.getElementById(key + '_end').value;
    } else {
        formData[key] = document.getElementById(key).value;
    }
});

// Order formData to ensure _start fields come before _end fields
Object.keys(formData).sort((a, b) => {
    // Custom sorting logic to ensure _start keys come before _end keys
    if (a.endsWith('_start') && b.endsWith('_end')) return -1;
    if (a.endsWith('_end') && b.endsWith('_start')) return 1;
    return a.localeCompare(b); // Default alphanumeric sorting for other keys
}) 
    .forEach(key => {
    orderedFormData[key] = formData[key];
});

console.log('Form Data:', orderedFormData);
document.getElementById('submitMessage').textContent = 'Form submitted successfully!';
}
document.addEventListener('DOMContentLoaded', function () {
    const parameters = JSON.parse(document.getElementById('parameters').textContent);
    const parametersContainer = document.getElementById('parametersContainer');

    Object.keys(parameters).forEach(key => {
        const formGroup = createFormGroup(key, parameters[key]);
        parametersContainer.appendChild(formGroup);
    });

    document.getElementById('submitButton').addEventListener('click', function () {
        handleSubmit(parameters);
    });
});