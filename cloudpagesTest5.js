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

        if (parameter.mode === 'multi') {
            const selectedItemsContainer = document.createElement('div');
            selectedItemsContainer.className = 'selected-items';
            autocompleteContainer.appendChild(selectedItemsContainer);

            autocompleteInput.addEventListener('input', function(event) {
                const inputValue = this.value.trim().toLowerCase();
                var results = fb_client.runQuery(parameter.sql);
                var results_obj = JSON.parse(results);
                performAutocompleteSearch(key, parameter, inputValue, results_obj, resultsContainer, autocompleteInput, selectedItemsContainer);
            });
        } else {
            autocompleteInput.addEventListener('input', function(event) {
                const inputValue = this.value.trim().toLowerCase();
                var results = fb_client.runQuery(parameter.sql);
                var results_obj = JSON.parse(results);
                performAutocompleteSearch(key, parameter, inputValue, results_obj, resultsContainer, autocompleteInput);
            });
        }
    /*if (inputValue.length >= parameter.minChars) {
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
    }*/
});

autocompleteInput.addEventListener('keydown', function(event) {
    const results = resultsContainer.children;
    if (event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % results.length;
        updateResultsHighlight(results);
    } else if (event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + results.length) % results.length;
        updateResultsHighlight(results);
    } else if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission on Enter
        if (results[selectedIndex]) {
            if (parameter.mode === 'multi') {
                addSelectedItem(key, parameter, results[selectedIndex], autocompleteInput, resultsContainer);
            } else {
                autocompleteInput.value = results[selectedIndex].innerText;
            }
            clearResults(resultsContainer);
        }
    }  else if (event.key === 'Tab') {
        event.preventDefault();
        if (results.length > 0) {
            selectedIndex = (selectedIndex + 1) % results.length;
            updateHighlight(results, selectedIndex);
        }
    } else if (event.key === 'Backspace') {
        // Prevent the default behavior of backspace in the input field
        event.preventDefault();

        // Get the current value of the input
        const currentValue = autocompleteInput.value;
        
        // Determine the position of the cursor in the input
        const cursorPosition = autocompleteInput.selectionStart;
        
        // Check if there is text to delete before the cursor
        if (cursorPosition > 0) {
            // Remove the character before the cursor
            const newValue = currentValue.slice(0, cursorPosition - 1) + currentValue.slice(cursorPosition);
            
            // Update the input value
            autocompleteInput.value = newValue;
            
            // Update the selection range to maintain cursor position
            autocompleteInput.setSelectionRange(cursorPosition - 1, cursorPosition - 1);
        }
    }
});

document.addEventListener('click', function(event) {
    if (!autocompleteContainer.contains(event.target)) {
        clearResults(resultsContainer);
    }
});

return autocompleteContainer;
}
function createCheckBox(key, parameter) {
    const checkBoxContainer = document.createElement('div');
    checkBoxContainer.className = 'checkbox-container';
    checkBoxContainer.setAttribute('id', key);

    var results = fb_client.runQuery(parameter.sql);
    var results_obj = JSON.parse(results);

    // Track the currently selected checkbox
    let selectedCheckbox = null;

    results_obj.forEach(option => {
        const label = document.createElement('label');

        const checkBox = document.createElement('input');
        checkBox.setAttribute('type', 'checkbox');
        checkBox.setAttribute('value', option[parameter.value]);

        // Check if the current checkbox should be pre-selected based on value
        if (parameter.mode === 'single' && parameter.value === option[parameter.value]) {
            checkBox.checked = true;
            selectedCheckbox = checkBox;
        }

        // Event listener to handle single selection
        checkBox.addEventListener('change', function() {
            if (parameter.mode === 'single') {
                if (this.checked && this !== selectedCheckbox) {
                    if (selectedCheckbox) {
                        selectedCheckbox.checked = false;
                    }
                    selectedCheckbox = this;
                } else if (!this.checked && this === selectedCheckbox) {
                    selectedCheckbox = null;
                }
            }
        });

        label.appendChild(checkBox);

        const text = document.createTextNode(`${option.name}, ${option.description}`);
        label.appendChild(text);

        checkBoxContainer.appendChild(label);
    });

    return checkBoxContainer;
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

            // Highlight the matching part of the name and description
            const highlightedName = highlightMatch(option.name, inputValue);
            const highlightedDescription = highlightMatch(option.description, inputValue);

            resultItem.innerHTML = `${highlightedName}, ${highlightedDescription}`; // Use innerHTML to allow span tags

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

function highlightMatch(text, query) {
    const startIndex = text.toLowerCase().indexOf(query.toLowerCase());
    if (startIndex === -1) {
        return text; // No match found
    }

    const endIndex = startIndex + query.length;
    const highlightedText = 
        text.slice(0, startIndex) + 
        `<span class="autocomplete-highlight">${text.slice(startIndex, endIndex)}</span>` + 
        text.slice(endIndex);

    return highlightedText;
}
function clearResults(resultsContainer) {
    while (resultsContainer.firstChild) {
        resultsContainer.removeChild(resultsContainer.firstChild);
    }
    resultsContainer.style.display = 'none';
    selectedIndex = -1;
}

function updateResultsHighlight(results) {
    for (let i = 0; i < results.length; i++) {
        results[i].classList.toggle('highlight', i === selectedIndex);
    }
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
function renderTable(data, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';  // Clear any previous table data

    if (data.length === 0) {
        const noDataMessage = document.createElement('p');
        noDataMessage.textContent = 'No data available';
        container.appendChild(noDataMessage);
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped'; // Add any Bootstrap or custom classes for styling

    // Create table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = Object.keys(data[0]); // Use the keys from the first object to create headers
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create table body
    const tbody = document.createElement('tbody');
    data.forEach(row => {
        const tableRow = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            td.textContent = row[header]; // Insert each cell value based on the header
            tableRow.appendChild(td);
        });
        tbody.appendChild(tableRow);
    });
    table.appendChild(tbody);

    container.appendChild(table);  // Append the table to the container
}

function handleSubmit(parameters) {
    if (!validateParameters(parameters)) {
        console.log('Form validation failed');
        return;
    }

    const formData = {};
    const orderedFormData = {};

    document.getElementById('exportBtn').addEventListener('click', function() {
    exportTableToExcel('tableContainer', 'ExportedTable');
});

function exportTableToExcel(tableId, filename = '') {
    // Select the table
    let table = document.querySelector(`#${tableId} table`);
    
    if (!table) {
        alert('No table to export!');
        return;
    }

    // Convert table to worksheet
    let workbook = XLSX.utils.table_to_book(table, {sheet: "Sheet1"});
    
    // Export to Excel
    XLSX.writeFile(workbook, `${filename}.xlsx`);
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
    const columns = JSON.parse(document.getElementById('columns').textContent);  // Load columns JSON
    const settings = JSON.parse(document.getElementById('settings').textContent);  // Load settings JSON
    
    const parametersContainer = document.getElementById('parametersContainer');

    Object.keys(parameters).forEach(key => {
        const formGroup = createFormGroup(key, parameters[key]);
        parametersContainer.appendChild(formGroup);
    });

    document.getElementById('submitButton').addEventListener('click', function () {
        handleSubmit(parameters);
    });

 document.getElementById('renderTableButton').addEventListener('click', function() {
    // Loop through the parameters to find the SQL query dynamically
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];

        if (parameter.sql) {  // If there's a SQL query present in this parameter
            var sqlQuery = parameter.sql;

            // Execute the SQL query
            var results = fb_client.runQuery(sqlQuery);
            var results_obj = JSON.parse(results);

            // Render all data to the table
            renderTable(results_obj, 'tableContainer');
        }
    });
});


});