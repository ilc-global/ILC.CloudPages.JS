document.addEventListener('DOMContentLoaded', function () {
    const parameters = JSON.parse(document.getElementById('parameters').textContent);
    
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
                    newErrorElement.textContent = `${parameter.label} is required.`; // Fixed line
                    isValid = false;
                }
            }
        });

        return isValid;
    }

    function createComboBox(key, parameter) {
        const comboBox = document.createElement('select');
        comboBox.className = 'form-control';
        comboBox.setAttribute('id', key);

        if (parameter.required) {
            comboBox.setAttribute('required', 'required');
        }
        if (parameter.mode === 'multi') {
            comboBox.setAttribute('multiple', 'multiple');
        }

        const defaultOption = document.createElement('option');
        defaultOption.textContent = 'Select an option';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        defaultOption.setAttribute('value', '');
        comboBox.appendChild(defaultOption);

        var results = fb_client.runQuery(parameter.sql);
        var results_obj = JSON.parse(results);

        results_obj.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.setAttribute('value', option[parameter.value]);
            optionElement.textContent = `${option.name}, ${option.description}`;
            comboBox.appendChild(optionElement);
        });

        return comboBox;
    }
    
    function createInputElement(parameter) {
        let inputElement;
        switch (parameter.type) {
            case 'text':
            case 'int':
            case 'pct':
            case 'amt':
                if (parameter.mode === 'range') {
                    inputElement = createRangeInput(key, parameter);
                } else {
                    inputElement = document.createElement('input');
                    inputElement.setAttribute('type', 'text');
                }
                break;
            case 'multiline':
                inputElement = document.createElement('textarea');
                break;
            case 'timestamp':
                if (parameter.mode === 'range') {
                    if (parameter.type === 'date') {
                        inputElement = createRangeDateInput(key);
                    } else if (parameter.type === 'time') {
                        inputElement = createRangeTimeInput(key);
                    } else if (parameter.type === 'timestamp') {
                        inputElement = createRangeTimestampInput(key);
                    }
                } else {
                    inputElement = document.createElement('input');
                    inputElement.setAttribute('type', parameter.type === 'timestamp' ? 'datetime-local' : parameter.type);
                }
                break;
            case 'date':
                if (parameter.mode === 'range') {
                    inputElement = createRangeDateInput(key);
                } else {
                    inputElement = document.createElement('input');
                    inputElement.setAttribute('type', 'date');
                }
            case 'time':
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', parameter.type);
                break;
            case 'combobox':
            inputElement = createComboBox(key, parameter);
                if (parameter.mode === 'multi') {
                    const helperText = document.createElement('label');
                    helperText.textContent = 'Control-click to multi-select';
                    helperText.className = 'helper-text'; // class for styling 
                    formGroup.appendChild(helperText);
                }
            break;
            case 'checkbox':
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'checkbox');
                break;
            case 'autocomplete': 
                inputElement = createAutocomplete(key, parameter);
                break;
            default:
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', parameter.type || 'text');
            }
        inputElement.setAttribute('class', 'form-control');
        inputElement.setAttribute('id', parameter.name);
        inputElement.setAttribute('placeholder', parameter.label);
        return inputElement;
    }

    function collectParameterValues(parameters) {
        const values = {};
    
        Object.keys(parameters).forEach(key => {
            const parameter = parameters[key];
            const element = document.getElementById(key);
    
            if (element) {
                if (parameter.type === 'combobox' && parameter.mode === 'multi') {
                    // Handle multi-select combobox
                    const selectedOptions = Array.from(element.selectedOptions).map(option => option.value);
                    values[key] = selectedOptions.filter(value => value !== 'Select an option');
                } else if (parameter.mode === 'multi') {
                    // Handle multi-select for other modes
                    const selectedItems = element.parentNode.querySelectorAll('.selected-item');
                    values[key] = Array.from(selectedItems).map(item => item.getAttribute('data-value'));
                } else if (parameter.type === 'checkbox') {
                    // Handle checkbox, possibly with multiple checkboxes within a group
                    const checkboxes = document.querySelectorAll(`#${key} input[type="checkbox"]`);
                    const checkedValues = Array.from(checkboxes).filter(checkbox => checkbox.checked).map(checkbox => checkbox.value);
                    values[key] = checkedValues.length > 0 ? checkedValues : undefined;
                } else if (parameter.type === 'combobox') {
                    // Handle single-select combobox
                    values[key] = element.value !== 'Select an option' ? element.value : undefined;
                } else if (parameter.type === 'autocomplete') {
                    // Handle autocomplete, using data-id attribute for the selected value
                    values[key] = element.dataset.id || undefined;
                } else {
                    // Default case, handling normal inputs
                    values[key] = element.getAttribute('data-value') || element.value;
                }
            }
        });
    
        return values;
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

    function createFormGroup(key, parameter) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group row';

        const labelElement = document.createElement('label');
        labelElement.className = 'col-sm-4 col-form-label';
        labelElement.textContent = parameter.label;
        if (parameter.required) {
            const asterisk = document.createElement('span');
            asterisk.textContent = '*';
            asterisk.className = 'required-asterisk';
            labelElement.appendChild(asterisk);
        }
        formGroup.appendChild(labelElement);

        const inputContainer = document.createElement('div');
        inputContainer.className = 'col-sm-8';

        const inputElement = createAutocomplete(key, parameter);
        inputContainer.appendChild(inputElement);

        formGroup.appendChild(inputContainer);

        return formGroup;
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

    function performAutocompleteSearch(key, parameter, inputValue, results, resultsContainer, autocompleteInput, selectedItemsContainer) {
        clearResults(resultsContainer);

        const matchedResults = results.filter(result => {
            return parameter.search.split(',').some(field => {
                return result[field.trim()].toString().toLowerCase().includes(inputValue);
            });
        });

        if (inputValue.length >= 1 && matchedResults.length > 0) {
            resultsContainer.style.display = 'block';
            matchedResults.forEach(result => {
                const resultItem = document.createElement('div');
                const displayText = parameter.display.split(',').map(field => result[field.trim()]).join(', ');

                const matchStart = displayText.toLowerCase().indexOf(inputValue);
                const matchEnd = matchStart + inputValue.length;
                resultItem.innerHTML = displayText.substring(0, matchStart) +
                    '<span class="predictive-text">' +
                    displayText.substring(matchStart, matchEnd) +
                    '</span>' +
                    displayText.substring(matchEnd);

                resultItem.setAttribute('data-value', result[parameter.value]);
                resultItem.addEventListener('click', function() {
                    if (parameter.mode === 'multi') {
                        addSelectedItem(key, parameter, resultItem, autocompleteInput, resultsContainer, selectedItemsContainer);
                    } else {
                        autocompleteInput.value = displayText;
                        autocompleteInput.setAttribute('data-value', result[parameter.value]); // Set the correct data-value                        }
                    }    
                    clearResults(resultsContainer);
                });
                resultsContainer.appendChild(resultItem);
            });

            // Autofill and highlight in the input box
            const bestMatch = matchedResults[0];
            const bestMatchDisplayText = parameter.display.split(',').map(field => bestMatch[field.trim()]).join(', ');
            const bestMatchEnd = bestMatchDisplayText.toLowerCase().indexOf(inputValue) + inputValue.length;
            const autofillText = bestMatchDisplayText.substring(bestMatchEnd);

            if (autofillText.length > 0) {
                autocompleteInput.value = inputValue + autofillText;
                autocompleteInput.setSelectionRange(inputValue.length, autocompleteInput.value.length);
                autocompleteInput.style.color = 'black';
            }
        } else {
            resultsContainer.style.display = 'none';
        }
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

    function addSelectedItem(key, parameter, resultItem, autocompleteInput, resultsContainer, selectedItemsContainer) {
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

    function initForm() {
        generateParameterForm();
        const parametersScript = document.getElementById('parameters');
        const parameters = JSON.parse(parametersScript.textContent);

        const parametersContainer = document.getElementById('parametersContainer');

        Object.keys(parameters).forEach(key => {
            const parameter = parameters[key];
            const formGroup = createFormGroup(key, parameter);
            parametersContainer.appendChild(formGroup);
        });

        const submitButton = document.getElementById('submitButton');
        const submitMessage = document.getElementById('submitMessage');

        submitButton.addEventListener('click', function() {
            submitMessage.textContent = '';

            const isValid = validateParameters(parameters);
            if (isValid) {
                const parameterValues = collectParameterValues(parameters);
                console.log('JSON Object:', parameterValues); // Log to console

                // Display success message
                submitMessage.textContent = 'Form submitted successfully!';
                submitMessage.classList.remove('error-message');
                submitMessage.classList.add('success-message');
            } else {
                console.error('Please fill out all required fields.'); // Log error to console

                // Display error message
                submitMessage.textContent = 'Please fill in all required fields.';
                submitMessage.classList.remove('success-message');
                submitMessage.classList.add('error-message');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', initForm);
    
});
