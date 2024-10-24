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

    return {formGroup, uniqueId };;
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
// Handle Submit 
function handleSubmit(parameters) {
    // Collect form input values
    const formData = {};
    Object.keys(parameters).forEach(key => {
        const parameter = parameters[key];
        const uniqueId = uniqueIds[key]; // Retrieve the stored unique ID

        let value;
        if (parameter.type === 'date' && parameter.mode === 'range') {
            const startValue = document.getElementById(uniqueId + '_start').value;
            const endValue = document.getElementById(uniqueId + '_end').value;
            value = { start: startValue, end: endValue };
        } else {
            const element = document.getElementById(uniqueId);
            if (element) {
                if (parameter.type === 'combobox' && parameter.mode === 'multi') {
                    // Get selected options for multi-select
                    value = Array.from(element.selectedOptions).map(option => option.value);
                } else {
                    value = element.value;
                }
            }
        }
        formData[key] = value;
    })};

// Form initialization
function initForm() {
    const parametersElement = document.getElementById('parameters');
    const settingsElement = document.getElementById('settings');
    const queryElement = document.getElementById('query');

    // Parse parameters
    let parameters;
    try {
        const parametersText = parametersElement.textContent.trim();
        parameters = JSON.parse(parametersText);
    } catch (error) {
        console.error('Error parsing parameters JSON:', error);
        return;
    }

    // Parse settings
    let settings;
    try {
        const settingsText = settingsElement.textContent.trim();
        settings = JSON.parse(settingsText);
    } catch (error) {
        console.error('Error parsing settings JSON:', error);
        return;
    }

    // Get query text
    const queryText = queryElement.textContent.trim();

    // Parse parameter data from the "parameter" element
    let parametersData;
    try {
        parametersData = JSON.parse(document.getElementById("parameters").textContent);
    } catch (error) {
        console.error('Error parsing parameter data:', error);
        return;
    }

    const parametersContainer = document.getElementById('parametersContainer');
    const uniqueIds = {};

    Object.keys(parameters).forEach((key, index) => {
        const uniqueSuffix = index + '_' + Math.random().toString(36).substring(7);
        const { formGroup, uniqueId } = createFormGroup(key, parameters[key], uniqueSuffix);
        parametersContainer.appendChild(formGroup);
        uniqueIds[key] = uniqueId;
    });

    document.getElementById('submitButton').addEventListener('click', function () {
        handleSubmit(parameters, uniqueIds, queryText, settings);
    });
}

document.addEventListener('DOMContentLoaded', initForm);

