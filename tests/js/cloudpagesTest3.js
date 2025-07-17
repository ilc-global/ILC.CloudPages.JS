// cloudpages.js

function createFormGroup(key, parameter, uniqueSuffix) {
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

    let inputElement;
    const uniqueId = key + '_' + uniqueSuffix; // Ensure unique ID

    switch (parameter.type) {
        case 'autocomplete':
            inputElement = createAutocomplete(key, parameter, uniqueSuffix);
            inputContainer.appendChild(inputElement);
            break;
        case 'combobox':
            inputElement = createComboBox(key, parameter, uniqueSuffix);
            inputContainer.appendChild(inputElement);
            if (parameter.mode === 'multi') {
                const helperText = document.createElement('label');
                helperText.textContent = 'Control-click to multi-select';
                helperText.className = 'helper-text';
                inputContainer.appendChild(helperText);
            }
            break;
        case 'checkbox':
            inputElement = createCheckBox(key, parameter, uniqueSuffix);
            inputContainer.appendChild(inputElement);
            break;
        case 'date':
            if (parameter.mode === 'range') {
                inputElement = createRangeDateInput(key, uniqueSuffix);
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'date');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
            }
            inputContainer.appendChild(inputElement);
            break;
        case 'time':
            if (parameter.mode === 'range') {
                inputElement = createRangeTimeInput(key, uniqueSuffix);
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'time');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
            }
            inputContainer.appendChild(inputElement);
            break;
        case 'timestamp':
            if (parameter.mode === 'range') {
                inputElement = createRangeTimestampInput(key, uniqueSuffix);
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', 'datetime-local');
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', key); // Set id for input element
            }
            inputContainer.appendChild(inputElement);
            break;
        case 'int':
        case 'pct':
        case 'amt':
            if (parameter.mode === 'range') {
                inputElement = createRangeInput(key, parameter, uniqueSuffix);
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', parameter.type);
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', uniqueId);
            }
            inputContainer.appendChild(inputElement);
            break;
        default:
            inputElement = document.createElement('input');
            inputElement.setAttribute('type', 'text');
            inputElement.className = 'form-control';
            inputElement.setAttribute('id', uniqueId);
            inputContainer.appendChild(inputElement);
    }

    formGroup.appendChild(inputContainer);

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', uniqueId + '_error');
    formGroup.appendChild(errorElement);

    return { formGroup, uniqueId };
}

function createRangeInput(key, parameter, uniqueSuffix) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const uniqueId = key + '_' + uniqueSuffix;  // Ensure unique ID

    const startInput = document.createElement('input');
    startInput.setAttribute('type', 'text');
    startInput.className = 'form-control';
    startInput.setAttribute('id', uniqueId + '_start');
    formGroup.appendChild(startInput);

    const toLabel = document.createElement('span');
    toLabel.className = 'range-divider';
    toLabel.textContent = ' to ';
    formGroup.appendChild(toLabel);

    const endInput = document.createElement('input');
    endInput.setAttribute('type', 'text');
    endInput.className = 'form-control';
    endInput.setAttribute('id', uniqueId + '_end');
    formGroup.appendChild(endInput);

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', uniqueId + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}
//if you get rid of this, render geos away
function createRangeDateInput(key) {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const startInput = document.createElement('input');
    startInput.setAttribute('type', 'date');
    startInput.className = 'form-control';
    startInput.setAttribute('id', key + '_start');
    formGroup.appendChild(startInput);

    const toLabel = document.createElement('span');
    toLabel.className = 'range-divider';
    toLabel.textContent = ' to ';
    formGroup.appendChild(toLabel);

    const endInput = document.createElement('input');
    endInput.setAttribute('type', 'date');
    endInput.className = 'form-control';
    endInput.setAttribute('id', key + '_end');
    formGroup.appendChild(endInput);

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', key + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
}
// Autocomplete function, comboBox, and other helper functions here...

function validateParameters(parameters) {
    let isValid = true;
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        const element = document.getElementById(key + '_0'); // Unique ID based on form group

        const errorElement = document.getElementById(key + '_0_error');
        if (parameter.required && (!element || !element.value)) {
            errorElement.textContent = `${parameter.label} is required.`;
            isValid = false;
        } else {
            errorElement.textContent = '';
        }
    });
    return isValid;
}

function collectParameterValues(parameters) {
    const values = {};
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        const element = document.getElementById(key + '_0');
        values[key] = parameter.mode === 'multi'
            ? Array.from(document.querySelectorAll(`input[name=${key}]:checked`)).map(cb => cb.value)
            : element ? element.value : '';
    });
    return values;
}

function handleSubmit(parameters) {
    if (!validateParameters(parameters)) {
        console.error('Please fill out all required fields.');
        return;
    }

    const formData = collectParameterValues(parameters);
    console.log('Form Data:', formData);
    document.getElementById('submitMessage').textContent = 'Form submitted successfully!';
}

function initForm() {
    const parametersElement = document.getElementById('parameters');
    const parameters = JSON.parse(parametersElement.textContent);
    const parametersContainer = document.getElementById('parametersContainer');

    const processedParameters = new Set(); // Track processed parameters to avoid duplicates

    Object.keys(parameters).forEach((key, index) => {
        if (!processedParameters.has(key)) {
            const uniqueSuffix = index;  // Simplify the unique ID to just the index
            const { formGroup } = createFormGroup(key, parameters[key], uniqueSuffix);
            parametersContainer.appendChild(formGroup);
            processedParameters.add(key); // Add to set after processing
        }
    });

    document.getElementById('submitButton').addEventListener('click', () => handleSubmit(parameters));
}

document.addEventListener('DOMContentLoaded', initForm);
