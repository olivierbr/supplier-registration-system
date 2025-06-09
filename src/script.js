let currentStep = 1;
const totalSteps = 3;

function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    
    // Show current step
    document.getElementById(`step${step}`).classList.add('active');
    document.querySelector(`[data-step="${step}"]`).classList.add('active');
}

function nextStep() {
    if (validateCurrentStep()) {
        if (currentStep < totalSteps) {
            currentStep++;
            showStep(currentStep);
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
    }
}

function validateCurrentStep() {
    const currentStepElement = document.getElementById(`step${currentStep}`);
    const requiredFields = currentStepElement.querySelectorAll('[required]');
    
    let isValid = true;
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.style.borderColor = '#dc3545';
            isValid = false;
        } else {
            field.style.borderColor = '#e9ecef';
        }
    });
    
    if (!isValid) {
        alert('Please fill in all required fields.');
    }
    
    return isValid;
}

async function validateVAT() {
    const vatNumber = document.getElementById('vatNumber').value;
    const validationDiv = document.getElementById('vatValidation');
    
    if (!vatNumber) {
        validationDiv.innerHTML = '<p class="validation-result invalid">Please enter a VAT number</p>';
        return;
    }
    
    validationDiv.innerHTML = '<p>Validating VAT number...</p>';
    
    try {
        const response = await fetch('/api/ValidateVAT', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ vatNumber: vatNumber })
        });
        
        const result = await response.json();
        
        if (result.valid) {
            validationDiv.innerHTML = '<p class="validation-result valid">✓ VAT number is valid</p>';
        } else {
            validationDiv.innerHTML = '<p class="validation-result invalid">✗ VAT number is invalid</p>';
        }
    } catch (error) {
        validationDiv.innerHTML = '<p class="validation-result invalid">Error validating VAT number</p>';
    }
}



// Example usage in your form submit handler
document.getElementById('supplierForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Get form data
    const formData = {
        companyName: document.getElementById('companyName').value,
        contactPerson: document.getElementById('contactPerson').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        businessType: document.getElementById('businessType').value,
        description: document.getElementById('description').value
    };
    
    try {
        const result = await registerSupplier(formData);
        
        // Success handling
        document.getElementById('successMessage').style.display = 'block';
        document.getElementById('successMessage').innerHTML = 
            `Registration successful! Your supplier ID is: ${result.supplierId}`;
        
        // Reset form
        this.reset();
        
    } catch (error) {
        // Error handling
        document.getElementById('errorMessage').style.display = 'block';
        document.getElementById('errorMessage').innerHTML = error.message;
    }
});


/*
document.getElementById('supplierForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    if (!validateCurrentStep()) {
        return;
    }
    
    // Show loading
    document.querySelector('.container').style.display = 'none';
    document.getElementById('loading').classList.remove('hidden');
    
    // Collect form data
    const formData = new FormData(this);
    const supplierData = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/SaveSupplier', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(supplierData)
        });
        
        if (response.ok) {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('success').classList.remove('hidden');
        } else {
            throw new Error('Registration failed');
        }
    } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        document.querySelector('.container').style.display = 'block';
        alert('Registration failed. Please try again.');
    }
});
*/

// Initialize form
document.addEventListener('DOMContentLoaded', function() {
    showStep(1);
});