// Common helper functions

function createFormGroup(key, parameter, uniqueSuffix) {
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
    const uniqueId = key + '_' + uniqueSuffix;  // Ensure unique ID
    switch (parameter.type) {
        case 'date':
        case 'time':
        case 'timestamp':
        case 'int':
        case 'pct':
        case 'amt':
            if (parameter.mode === 'range') {
                formGroup.appendChild(createRangeInput(key, parameter, uniqueSuffix));
            } else {
                inputElement = document.createElement('input');
                inputElement.setAttribute('type', parameter.type === 'timestamp' ? 'datetime-local' : parameter.type);
                inputElement.className = 'form-control';
                inputElement.setAttribute('id', uniqueId);
                formGroup.appendChild(inputElement);
            }
            break;
        case 'combobox':
            inputElement = createComboBox(key, parameter, uniqueSuffix);
            formGroup.appendChild(inputElement);
            if (parameter.mode === 'multi') {
                const helperText = document.createElement('label');
                helperText.textContent = 'Control-click to multi-select';
                helperText.className = 'helper-text';
                formGroup.appendChild(helperText);
            }
            break;
        case 'checkbox':
            inputElement = createCheckBox(key, parameter, uniqueSuffix);
            formGroup.appendChild(inputElement);
            break;
        case 'autocomplete':
            inputElement = createAutocomplete(key, parameter, uniqueSuffix);
            formGroup.appendChild(inputElement);
            break;
        default:
            inputElement = document.createElement('input');
            inputElement.setAttribute('type', 'text');
            inputElement.className = 'form-control';
            inputElement.setAttribute('id', uniqueId);
            formGroup.appendChild(inputElement);
    }

    const errorElement = document.createElement('span');
    errorElement.className = 'error';
    errorElement.setAttribute('id', uniqueId + '_error');
    formGroup.appendChild(errorElement);

    return formGroup;
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

function createComboBox(key, parameter, uniqueSuffix) {
    const uniqueId = key + '_' + uniqueSuffix;  // Ensure unique ID
    const selectElement = document.createElement('select');
    selectElement.className = 'form-control';
    selectElement.setAttribute('id', uniqueId);

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

// Other functions remain the same, adding the uniqueSuffix argument where necessary

// Form initialization
function initForm() {
    const parametersElement = document.getElementById('parameter'); //changed
    
    if (!parametersElement) {
        console.error('Parameters element not found');
        return;
    }

    const parametersText = parametersElement.textContent.trim();
    if (!parametersText) {
        console.error('Parameters script element is empty');
        return;
    }

    console.log('Parameters Text:', parametersText);

    let parameters;
    try {
        parameters = JSON.parse(parametersText);
        console.log('Parsed Parameters:', parameters);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return;
    }

    const parametersContainer = document.getElementById('parametersContainer');
    
    Object.keys(parameters).forEach((key, index) => {
        const uniqueSuffix = index + '_' + Math.random().toString(36).substring(7);  // Create a unique suffix for each form element
        const formGroup = createFormGroup(key, parameters[key], uniqueSuffix);
        parametersContainer.appendChild(formGroup);
    });

    document.getElementById('submitButton').addEventListener('click', function () {
        handleSubmit(parameters);
    });
}

document.addEventListener('DOMContentLoaded', initForm);
