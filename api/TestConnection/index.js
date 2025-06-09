// File: api/TestConnection/index.js
module.exports = async function (context, req) {
    context.log('TestConnection function called');
    context.log('Method:', req.method);
    context.log('Body:', JSON.stringify(req.body, null, 2));
    
    // If it's a POST request, validate the form data structure
    if (req.method === 'POST' && req.body) {
        const formData = req.body;
        
        // Check all the fields from your actual form
        const formFields = {
            // Step 1: Company Information
            companyName: formData.companyName,
            contactPerson: formData.contactPerson,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            postalCode: formData.postalCode,
            country: formData.country,
            
            // Step 2: VAT Information
            vatNumber: formData.vatNumber,
            
            // Step 3: Bank Information
            iban: formData.iban,
            bic: formData.bic,
            bankName: formData.bankName
        };
        
        // Check required fields based on your form
        const requiredFields = ['companyName', 'email', 'vatNumber', 'iban'];
        const missingRequired = requiredFields.filter(field => !formData[field] || formData[field].trim() === '');
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isEmailValid = formData.email && emailRegex.test(formData.email);
        
        context.res = {
            status: 200,
            body: {
                success: true,
                message: "Form data received and validated",
                receivedFields: formFields,
                validation: {
                    missingRequiredFields: missingRequired,
                    emailValid: isEmailValid,
                    totalFieldsReceived: Object.keys(formData).length,
                    requiredFieldsPresent: requiredFields.length - missingRequired.length
                },
                environment: {
                    nodeVersion: process.version,
                    timestamp: new Date().toISOString(),
                    databaseConfig: {
                        hasSQL_USER: !!process.env.SQL_USER,
                        hasSQL_PASSWORD: !!process.env.SQL_PASSWORD,
                        hasSQL_SERVER: !!process.env.SQL_SERVER,
                        hasSQL_DATABASE: !!process.env.SQL_DATABASE,
                        sqlServer: process.env.SQL_SERVER ? `${process.env.SQL_SERVER.substring(0, 10)}...` : 'Not set'
                    },
                    emailConfig: {
                        hasCommunicationString: !!process.env.COMMUNICATION_SERVICES_CONNECTION_STRING,
                        hasAdminEmails: !!process.env.ADMIN_EMAILS
                    }
                }
            }
        };
    } else {
        // GET request or no body
        context.res = {
            status: 200,
            body: {
                success: true,
                message: "TestConnection API is working!",
                method: req.method,
                expectedFormFields: [
                    'companyName (required)',
                    'contactPerson',
                    'email (required)',
                    'phone',
                    'address',
                    'city',
                    'postalCode',
                    'country',
                    'vatNumber (required)',
                    'iban (required)',
                    'bic',
                    'bankName'
                ],
                environment: {
                    nodeVersion: process.version,
                    timestamp: new Date().toISOString(),
                    databaseConfig: {
                        hasSQL_USER: !!process.env.SQL_USER,
                        hasSQL_PASSWORD: !!process.env.SQL_PASSWORD,
                        hasSQL_SERVER: !!process.env.SQL_SERVER,
                        hasSQL_DATABASE: !!process.env.SQL_DATABASE
                    }
                }
            }
        };
    }
};