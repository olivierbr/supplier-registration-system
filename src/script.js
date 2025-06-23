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
    
 console.log('=== FORM SUBMISSION STARTED ===');

    // Get form data
    // Collect all form data
    const formData = {
        // Step 1: Company Information
        companyName: document.getElementById('companyName').value.trim(),
        contactPerson: document.getElementById('contactPerson').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        address: document.getElementById('address').value.trim(),
        city: document.getElementById('city').value.trim(),
        postalCode: document.getElementById('postalCode').value.trim(),
        country: document.getElementById('country').value,
        
        // Step 2: VAT Information
        vatNumber: document.getElementById('vatNumber').value.trim(),
        
        // Step 3: Bank Information
        iban: document.getElementById('iban').value.trim(),
        bic: document.getElementById('bic').value.trim(),
        bankName: document.getElementById('bankName').value.trim()
    };
    
 console.log('Form data collected:', formData);
// Show loading state
    const submitButton = document.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Submitting...';
    submitButton.disabled = true;



    try {
        console.log('Sending request to /api/SaveSupplier');
        const response = await fetch('/api/SaveSupplier', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        // Get response text first
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        let responseData;
        try {
            responseData = JSON.parse(responseText);
            //console.log('Parsed response:', responseData);
        } catch (parseError) {
            console.error('Failed to parse JSON:', parseError);
            throw new Error(`Server returned invalid response: ${responseText}`);
        }
        
        if (!response.ok) {
            console.error('HTTP Error:', response.status, responseData);
            throw new Error(responseData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        /*
        if (!responseData.success) {
            console.error('Business logic error:', responseData);
            throw new Error(responseData.error || 'Registration failed');
        }
        */
        
        //console.log('=== REGISTRATION SUCCESSFUL ===');
        
        // Show success message
        const successHtml = `
            <div class="success-message">
                <h2>Registration Successful!</h2>
                <p>Thank you for registering as a supplier.</p>
                <p><strong>Supplier ID:</strong> ${responseData.supplierId}</p>
                <p><strong>Company:</strong> ${responseData.companyName}</p>
                <p><strong>Status:</strong> ${responseData.status}</p>
                <p>You will receive an email confirmation shortly. Our team will review your application and contact you within 2-3 business days.</p>
            </div>
        `;
        
        // Replace form with success message
        document.getElementById('supplierForm').innerHTML = successHtml;
        
    } catch (error) {
        console.error('=== REGISTRATION FAILED ===');
        console.error('Error:', error);
        
        // Show error message
        alert(`Registration failed: ${error.message}`);
        
        // You could also show a more user-friendly error div
        let errorDiv = document.getElementById('errorMessage');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'errorMessage';
            errorDiv.className = 'error-message';
            document.getElementById('supplierForm').insertBefore(errorDiv, document.getElementById('supplierForm').firstChild);
        }
        errorDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
        errorDiv.style.display = 'block';
        
    } finally {
        // Reset button
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
});

// Test the API connection when page loads
window.addEventListener('load', async function() {
    try {
        console.log('Testing API connection...');
        const response = await fetch('/api/TestConnection');
        const data = await response.json();
        console.log('API test result:', data);
    } catch (error) {
        console.error('API test failed:', error);
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