const sql = require('mssql');
const validator = require('validator');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const cache = require('memory-cache');
const { EmailClient } = require('@azure/communication-email');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const config = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

// Initialize Email Client
const emailClient = new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING);

// Rate limiting function
function checkRateLimit(clientId) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 5; // Max 5 requests per 15 minutes
    
    const key = `rate_limit_${clientId}`;
    const requests = cache.get(key) || [];
    
    // Remove old requests
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    if (validRequests.length >= maxRequests) {
        return false;
    }
    
    validRequests.push(now);
    cache.put(key, validRequests, windowMs);
    return true;
}

// Input validation and sanitization
function validateAndSanitizeInput(data) {
    const errors = [];
    const sanitized = {};

    // Company Name - required
    if (!data.companyName || !data.companyName.trim()) {
        errors.push('Company name is required');
    } else {
        sanitized.companyName = DOMPurify.sanitize(data.companyName.trim());
        if (sanitized.companyName.length > 255) {
            errors.push('Company name must be less than 255 characters');
        }
    }

    // Contact Person - optional
    if (data.contactPerson) {
        sanitized.contactPerson = DOMPurify.sanitize(data.contactPerson.trim());
        if (sanitized.contactPerson.length > 255) {
            errors.push('Contact person name must be less than 255 characters');
        }
    }

    // Email - required and must be valid
    if (!data.email || !data.email.trim()) {
        errors.push('Email is required');
    } else {
        const email = data.email.trim().toLowerCase();
        if (!validator.isEmail(email)) {
            errors.push('Invalid email format');
        } else {
            sanitized.email = email;
        }
    }

    // Phone - optional but validate format if provided
    if (data.phone && data.phone.trim()) {
        const phone = data.phone.trim();
        // Allow international phone formats
        if (!validator.isMobilePhone(phone, 'any', { strictMode: false })) {
            errors.push('Invalid phone number format');
        } else {
            sanitized.phone = DOMPurify.sanitize(phone);
        }
    }

    // Address - optional
    if (data.address && data.address.trim()) {
        sanitized.address = DOMPurify.sanitize(data.address.trim());
        if (sanitized.address.length > 500) {
            errors.push('Address must be less than 500 characters');
        }
    }

    // City - optional
    if (data.city && data.city.trim()) {
        sanitized.city = DOMPurify.sanitize(data.city.trim());
        if (sanitized.city.length > 100) {
            errors.push('City must be less than 100 characters');
        }
    }

    // Postal Code - optional but validate format if provided
    if (data.postalCode && data.postalCode.trim()) {
        const postalCode = data.postalCode.trim();
        // Basic postal code validation (alphanumeric, spaces, hyphens)
        if (!/^[A-Za-z0-9\s\-]{2,20}$/.test(postalCode)) {
            errors.push('Invalid postal code format');
        } else {
            sanitized.postalCode = DOMPurify.sanitize(postalCode);
        }
    }

    // Country - optional but validate against allowed list
    if (data.country && data.country.trim()) {
        const allowedCountries = ['Belgium', 'Netherlands', 'France', 'Germany', 'Luxembourg'];
        if (!allowedCountries.includes(data.country)) {
            errors.push('Invalid country selection');
        } else {
            sanitized.country = data.country;
        }
    }

    // VAT Number - optional but validate format if provided
    if (data.vatNumber && data.vatNumber.trim()) {
        const vatNumber = data.vatNumber.trim().replace(/\s/g, '').toUpperCase();
        // EU VAT number patterns
        const vatPatterns = {
            'BE': /^BE[0-9]{10}$/,
            'NL': /^NL[0-9]{9}B[0-9]{2}$/,
            'FR': /^FR[0-9A-Z]{2}[0-9]{9}$/,
            'DE': /^DE[0-9]{9}$/,
            'LU': /^LU[0-9]{8}$/
        };
        
        let isValidVAT = false;
        for (const [country, pattern] of Object.entries(vatPatterns)) {
            if (pattern.test(vatNumber)) {
                isValidVAT = true;
                break;
            }
        }
        
        if (!isValidVAT) {
            errors.push('Invalid VAT number format');
        } else {
            sanitized.vatNumber = vatNumber;
        }
    }

    // IBAN - required and must be valid
    if (!data.iban || !data.iban.trim()) {
        errors.push('IBAN is required');
    } else {
        const iban = data.iban.trim().replace(/\s/g, '').toUpperCase();
        if (!validator.isIBAN(iban)) {
            errors.push('Invalid IBAN format');
        } else {
            sanitized.iban = iban;
        }
    }

    // BIC - optional but validate format if provided
    if (data.bic && data.bic.trim()) {
        const bic = data.bic.trim().toUpperCase();
        if (!validator.isBIC(bic)) {
            errors.push('Invalid BIC format');
        } else {
            sanitized.bic = bic;
        }
    }

    // Bank Name - optional
    if (data.bankName && data.bankName.trim()) {
        sanitized.bankName = DOMPurify.sanitize(data.bankName.trim());
        if (sanitized.bankName.length > 255) {
            errors.push('Bank name must be less than 255 characters');
        }
    }

    return { errors, sanitized };
}

// Email notification functions
async function sendConfirmationEmail(supplierData) {
    const emailMessage = {
        senderAddress: process.env.SENDER_EMAIL,
        content: {
            subject: "Supplier Registration Confirmation",
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                        .info-row { margin: 15px 0; }
                        .label { font-weight: bold; color: #667eea; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Registration Confirmed</h1>
                            <p>Thank you for registering as our supplier</p>
                        </div>
                        <div class="content">
                            <p>Dear ${supplierData.contactPerson || 'Supplier'},</p>
                            <p>We have successfully received your supplier registration. Here are the details we have on file:</p>
                            
                            <div class="info-row">
                                <span class="label">Company Name:</span> ${supplierData.companyName}
                            </div>
                            ${supplierData.contactPerson ? `<div class="info-row"><span class="label">Contact Person:</span> ${supplierData.contactPerson}</div>` : ''}
                            <div class="info-row">
                                <span class="label">Email:</span> ${supplierData.email}
                            </div>
                            ${supplierData.phone ? `<div class="info-row"><span class="label">Phone:</span> ${supplierData.phone}</div>` : ''}
                            ${supplierData.vatNumber ? `<div class="info-row"><span class="label">VAT Number:</span> ${supplierData.vatNumber}</div>` : ''}
                            <div class="info-row">
                                <span class="label">IBAN:</span> ${supplierData.iban}
                            </div>
                            ${supplierData.bic ? `<div class="info-row"><span class="label">BIC:</span> ${supplierData.bic}</div>` : ''}
                            
                            <p><strong>What happens next?</strong></p>
                            <ul>
                                <li>Our team will review your registration within 2-3 business days</li>
                                <li>We may contact you for additional information or documentation</li>
                                <li>Once approved, you will receive a welcome email with next steps</li>
                            </ul>
                            
                            <p>If you have any questions, please contact us at ${process.env.SUPPORT_EMAIL || 'support@company.com'}</p>
                        </div>
                        <div class="footer">
                            <p>&copy; 2025 Your Company Name. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        },
        recipients: {
            to: [{ address: supplierData.email }]
        }
    };

    try {
        const response = await emailClient.beginSend(emailMessage);
        return { success: true, messageId: response.id };
    } catch (error) {
        console.error('Error sending confirmation email:', error);
        return { success: false, error: error.message };
    }
}

async function sendNotificationEmail(supplierData) {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').filter(email => email.trim());
    
    if (adminEmails.length === 0) {
        return { success: false, error: 'No admin emails configured' };
    }

    const emailMessage = {
        senderAddress: process.env.SENDER_EMAIL,
        content: {
            subject: `New Supplier Registration: ${supplierData.companyName}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
                        .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
                        .info-item { background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #667eea; }
                        .label { font-weight: bold; color: #667eea; display: block; margin-bottom: 5px; }
                        .value { color: #333; }
                        .action-buttons { text-align: center; margin: 30px 0; }
                        .btn { display: inline-block; padding: 12px 24px; margin: 0 10px; color: white; text-decoration: none; border-radius: 4px; }
                        .btn-approve { background: #28a745; }
                        .btn-review { background: #667eea; }
                        @media (max-width: 600px) { .info-grid { grid-template-columns: 1fr; } }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🏢 New Supplier Registration</h1>
                            <p>A new supplier has registered on the portal</p>
                        </div>
                        <div class="content">
                            <p><strong>Registration Time:</strong> ${new Date().toLocaleString('en-BE', { timeZone: 'Europe/Brussels' })}</p>
                            
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="label">Company Name</span>
                                    <span class="value">${supplierData.companyName}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Contact Person</span>
                                    <span class="value">${supplierData.contactPerson || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Email</span>
                                    <span class="value">${supplierData.email}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Phone</span>
                                    <span class="value">${supplierData.phone || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Address</span>
                                    <span class="value">${supplierData.address || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">City</span>
                                    <span class="value">${supplierData.city || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Postal Code</span>
                                    <span class="value">${supplierData.postalCode || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Country</span>
                                    <span class="value">${supplierData.country || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">VAT Number</span>
                                    <span class="value">${supplierData.vatNumber || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">IBAN</span>
                                    <span class="value">${supplierData.iban}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">BIC</span>
                                    <span class="value">${supplierData.bic || 'Not provided'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">Bank Name</span>
                                    <span class="value">${supplierData.bankName || 'Not provided'}</span>
                                </div>
                            </div>
                            
                            <div class="action-buttons">
                                <a href="${process.env.ADMIN_PORTAL_URL || '#'}" class="btn btn-review">Review in Admin Portal</a>
                                <a href="mailto:${supplierData.email}" class="btn btn-approve">Contact Supplier</a>
                            </div>
                            
                            <p><strong>Next Steps:</strong></p>
                            <ul>
                                <li>Review the supplier information</li>
                                <li>Verify VAT number and banking details</li>
                                <li>Request additional documentation if needed</li>
                                <li>Approve or reject the registration</li>
                            </ul>
                        </div>
                    </div>
                </body>
                </html>
            `
        },
        recipients: {
            to: adminEmails.map(email => ({ address: email.trim() }))
        }
    };

    try {
        const response = await emailClient.beginSend(emailMessage);
        return { success: true, messageId: response.id };
    } catch (error) {
        console.error('Error sending notification email:', error);
        return { success: false, error: error.message };
    }
}

// CORS headers
function setCorsHeaders(context) {
    context.res.headers = {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
    };
}

module.exports = async function (context, req) {
    context.log('SaveSupplier function processed a request.');

    // Set CORS headers
    setCorsHeaders(context);

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            body: ''
        };
        return;
    }

    try {
        // Rate limiting
        const clientId = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
        if (!checkRateLimit(clientId)) {
            context.res = {
                status: 429,
                body: { error: "Rate limit exceeded. Please try again later." }
            };
            return;
        }

        // Validate and sanitize input
        const { errors, sanitized } = validateAndSanitizeInput(req.body || {});
        
        if (errors.length > 0) {
            context.res = {
                status: 400,
                body: { error: "Validation failed", details: errors }
            };
            return;
        }

        // Connect to database
        await sql.connect(config);

        const request = new sql.Request();
        
        // Check if supplier already exists
        const existingSupplier = await request
            .input('email', sql.NVarChar, sanitized.email)
            .query('SELECT Id FROM Suppliers WHERE Email = @email');

        if (existingSupplier.recordset.length > 0) {
            context.res = {
                status: 409,
                body: { error: "A supplier with this email already exists" }
            };
            return;
        }

        // Insert supplier data
        const insertRequest = new sql.Request();
        const query = `
            INSERT INTO Suppliers (
                CompanyName, ContactPerson, Email, Phone, Address, 
                City, PostalCode, Country, VATNumber, IBAN, BIC, BankName
            ) VALUES (
                @companyName, @contactPerson, @email, @phone, @address,
                @city, @postalCode, @country, @vatNumber, @iban, @bic, @bankName
            )
        `;

        insertRequest.input('companyName', sql.NVarChar, sanitized.companyName);
        insertRequest.input('contactPerson', sql.NVarChar, sanitized.contactPerson || null);
        insertRequest.input('email', sql.NVarChar, sanitized.email);
        insertRequest.input('phone', sql.NVarChar, sanitized.phone || null);
        insertRequest.input('address', sql.NVarChar, sanitized.address || null);
        insertRequest.input('city', sql.NVarChar, sanitized.city || null);
        insertRequest.input('postalCode', sql.NVarChar, sanitized.postalCode || null);
        insertRequest.input('country', sql.NVarChar, sanitized.country || null);
        insertRequest.input('vatNumber', sql.NVarChar, sanitized.vatNumber || null);
        insertRequest.input('iban', sql.NVarChar, sanitized.iban);
        insertRequest.input('bic', sql.NVarChar, sanitized.bic || null);
        insertRequest.input('bankName', sql.NVarChar, sanitized.bankName || null);

        await insertRequest.query(query);

        // Send email notifications (don't fail the registration if emails fail)
        const emailResults = {
            confirmation: { success: false },
            notification: { success: false }
        };

        try {
            // Send confirmation email to supplier
            emailResults.confirmation = await sendConfirmationEmail(sanitized);
            
            // Send notification email to admins
            emailResults.notification = await sendNotificationEmail(sanitized);
        } catch (emailError) {
            context.log.error('Email sending failed:', emailError);
            // Continue with successful registration even if emails fail
        }

        context.res = {
            status: 200,
            body: { 
                message: "Supplier registered successfully",
                data: {
                    companyName: sanitized.companyName,
                    email: sanitized.email
                },
                emailStatus: {
                    confirmationSent: emailResults.confirmation.success,
                    notificationSent: emailResults.notification.success
                }
            }
        };

    } catch (error) {
        context.log.error('Error saving supplier:', error);
        context.res = {
            status: 500,
            body: { error: "Internal server error" }
        };
    } finally {
        await sql.close();
    }
};
```ic = bic;
        }
    }

    // Bank Name - optional
    if (data.bankName && data.bankName.trim()) {
        sanitized.bankName = DOMPurify.sanitize(data.bankName.trim());
        if (sanitized.bankName.length > 255) {
            errors.push('Bank name must be less than 255 characters');
        }
    }

    return { errors, sanitized };
}

// CORS headers
function setCorsHeaders(context) {
    context.res.headers = {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
    };
}

module.exports = async function (context, req) {
    context.log('SaveSupplier function processed a request.');

    // Set CORS headers
    setCorsHeaders(context);

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            body: ''
        };
        return;
    }

    try {
        // Rate limiting
        const clientId = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
        if (!checkRateLimit(clientId)) {
            context.res = {
                status: 429,
                body: { error: "Rate limit exceeded. Please try again later." }
            };
            return;
        }

        // Validate and sanitize input
        const { errors, sanitized } = validateAndSanitizeInput(req.body || {});
        
        if (errors.length > 0) {
            context.res = {
                status: 400,
                body: { error: "Validation failed", details: errors }
            };
            return;
        }

        // Connect to database
        await sql.connect(config);

        const request = new sql.Request();
        
        // Check if supplier already exists
        const existingSupplier = await request
            .input('email', sql.NVarChar, sanitized.email)
            .query('SELECT Id FROM Suppliers WHERE Email = @email');

        if (existingSupplier.recordset.length > 0) {
            context.res = {
                status: 409,
                body: { error: "A supplier with this email already exists" }
            };
            return;
        }

        // Insert supplier data
        const insertRequest = new sql.Request();
        const query = `
            INSERT INTO Suppliers (
                CompanyName, ContactPerson, Email, Phone, Address, 
                City, PostalCode, Country, VATNumber, IBAN, BIC, BankName
            ) VALUES (
                @companyName, @contactPerson, @email, @phone, @address,
                @city, @postalCode, @country, @vatNumber, @iban, @bic, @bankName
            )
        `;

        insertRequest.input('companyName', sql.NVarChar, sanitized.companyName);
        insertRequest.input('contactPerson', sql.NVarChar, sanitized.contactPerson || null);
        insertRequest.input('email', sql.NVarChar, sanitized.email);
        insertRequest.input('phone', sql.NVarChar, sanitized.phone || null);
        insertRequest.input('address', sql.NVarChar, sanitized.address || null);
        insertRequest.input('city', sql.NVarChar, sanitized.city || null);
        insertRequest.input('postalCode', sql.NVarChar, sanitized.postalCode || null);
        insertRequest.input('country', sql.NVarChar, sanitized.country || null);
        insertRequest.input('vatNumber', sql.NVarChar, sanitized.vatNumber || null);
        insertRequest.input('iban', sql.NVarChar, sanitized.iban);
        insertRequest.input('bic', sql.NVarChar, sanitized.bic || null);
        insertRequest.input('bankName', sql.NVarChar, sanitized.bankName || null);

        await insertRequest.query(query);

        context.res = {
            status: 200,
            body: { 
                message: "Supplier registered successfully",
                data: {
                    companyName: sanitized.companyName,
                    email: sanitized.email
                }
            }
        };

    } catch (error) {
        context.log.error('Error saving supplier:', error);
        context.res = {
            status: 500,
            body: { error: "Internal server error" }
        };
    } finally {
        await sql.close();
    }
};