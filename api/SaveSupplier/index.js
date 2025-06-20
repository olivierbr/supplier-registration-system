const sql = require('mssql');
const validator = require('validator');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const cache = require('memory-cache');
const { EmailClient } = require('@azure/communication-email');
const keyVault = require('../shared/keyVault');

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

// Initialize configuration with Key Vault
async function getConfig() {
    try {
        const secrets = await keyVault.getAllSecrets();
        
        console.error('----------  PASSWORD from Key Vault: ', secrets.sqlPassword)

        return {
            user: process.env.SQL_USER,
            password: secrets.sqlPassword,
            server: process.env.SQL_SERVER,
            database: process.env.SQL_DATABASE,
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };





    } catch (error) {
        console.error('Error getting configuration:', error);
        // Fallback to environment variables
        return {
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            server: process.env.SQL_SERVER,
            database: process.env.SQL_DATABASE,
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };
    }
}

// Initialize Email Client with Key Vault
/*
async function getEmailClient() {
    try {
        const connectionString = await keyVault.getSecret('communication-connection-string');
        return new EmailClient(connectionString);
    } catch (error) {
        console.error('Error initializing email client:', error);
        return new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING);
    }
}
    */

async function getEmailClient() {
    try {
        console.log('🔍 Getting email connection string from Key Vault...');
        const connectionString = await keyVault.getSecret('communication-connection-string');
        console.log('✅ Email connection string retrieved from Key Vault');
        console.log('🔍 Connection string preview:', connectionString ? connectionString.substring(0, 20) + '...' : 'NULL');
        
        const client = new EmailClient(connectionString);
        console.log('✅ Email client initialized successfully');
        return client;
    } catch (error) {
        console.error('❌ Error getting email connection from Key Vault:', error);
        console.log('🔄 Falling back to environment variable...');
        
        const fallbackConnectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
        if (!fallbackConnectionString) {
            console.error('❌ No fallback email connection string available');
            throw new Error('No email connection string available');
        }
        
        console.log('✅ Using fallback email connection string');
        return new EmailClient(fallbackConnectionString);
    }
}

// Initialize Email Client
//const emailClient = new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING);

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

    console.error('--------- IBAN obr ------------  ', data.iban);

        console.log ('THIS IS SOME LOGGING');
        console.info('HERE IS SOME INFO logging');


    // IBAN - required and must be valid
    if (!data.iban || !data.iban.trim()) {
        errors.push('IBAN is required');
    } else {
        const iban = data.iban.trim().replace(/\s/g, '').toUpperCase();
        console.debug("=== IBAN validation ===  ", iban);

        if (!validator.isIBAN(iban)) {
            //errors.push('Invalid IBAN format');
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


/*
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
*/


async function sendConfirmationEmail(supplierData, emailClient, context) {
    context.log('📧 Starting confirmation email send...');
    
    const senderEmail = process.env.SENDER_EMAIL;
    if (!senderEmail) {
        context.log('❌ SENDER_EMAIL environment variable not set');
        return { success: false, error: 'SENDER_EMAIL not configured' };
    }
    
    context.log('📧 Sender email:', senderEmail);
    context.log('📧 Recipient email:', supplierData.email);

    const emailMessage = {
        senderAddress: senderEmail,
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
        context.log('📧 Sending confirmation email...');
        context.log('📧 Email message structure:', JSON.stringify({
            senderAddress: emailMessage.senderAddress,
            recipientCount: emailMessage.recipients.to.length,
            subject: emailMessage.content.subject
        }, null, 2));
        
        const response = await emailClient.beginSend(emailMessage);
        context.log('✅ Confirmation email sent successfully');
        context.log('📧 Response:', JSON.stringify(response, null, 2));
        return { success: true, messageId: response.id };
    } catch (error) {
        context.log('❌ Error sending confirmation email:', error);
        context.log('❌ Error details:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
    }
}

async function sendNotificationEmail(supplierData, emailClient, context) {
    context.log('📧 Starting notification email send...');
    
    // Get admin emails from Key Vault
    let adminEmails;
    try {
        const adminEmailsString = await keyVault.getSecret('admin-emails');
        adminEmails = adminEmailsString.split(',').filter(email => email.trim());
        context.log('📧 Admin emails from Key Vault:', adminEmails);
    } catch (error) {
        context.log('❌ Failed to get admin emails from Key Vault:', error);
        adminEmails = (process.env.ADMIN_EMAILS || '').split(',').filter(email => email.trim());
        context.log('📧 Admin emails from environment:', adminEmails);
    }
    
    if (adminEmails.length === 0) {
        context.log('❌ No admin emails configured');
        return { success: false, error: 'No admin emails configured' };
    }

    const senderEmail = process.env.SENDER_EMAIL;
    if (!senderEmail) {
        context.log('❌ SENDER_EMAIL environment variable not set');
        return { success: false, error: 'SENDER_EMAIL not configured' };
    }

    const emailMessage = {
        senderAddress: senderEmail,
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
        context.log('📧 Sending notification email...');
        context.log('📧 Email message structure:', JSON.stringify({
            senderAddress: emailMessage.senderAddress,
            recipientCount: emailMessage.recipients.to.length,
            subject: emailMessage.content.subject,
            recipients: adminEmails
        }, null, 2));
        
        const response = await emailClient.beginSend(emailMessage);
        context.log('✅ Notification email sent successfully');
        context.log('📧 Response:', JSON.stringify(response, null, 2));
        return { success: true, messageId: response.id };
    } catch (error) {
        context.log('❌ Error sending notification email:', error);
        context.log('❌ Error details:', JSON.stringify(error, null, 2));
        return { success: false, error: error.message };
    }
}













// debug purpose only
async function saveSupplier(formData) {
    console.log('=== REGISTRATION STARTED ===');
    console.log('Form data:', formData);
    
    try {
        const apiUrl = '/api/SaveSupplier'; // or your full URL
        console.log('Calling API:', apiUrl);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        // Get response text first (in case it's not valid JSON)
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        let responseData;
        try {
            responseData = JSON.parse(responseText);
            console.log('Parsed response:', responseData);
        } catch (parseError) {
            console.error('Failed to parse response as JSON:', parseError);
            throw new Error(`Server returned invalid JSON: ${responseText}`);
        }
        
        if (!response.ok) {
            console.error('HTTP Error:', response.status, responseData);
            throw new Error(responseData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (!responseData.success) {
            console.error('Business logic error:', responseData);
            throw new Error(responseData.error || 'Registration failed');
        }
        
        console.log('=== REGISTRATION SUCCESSFUL ===');
        return responseData;
        
    } catch (error) {
        console.error('=== REGISTRATION FAILED ===');
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        
        // Show user-friendly error
        alert(`Registration failed: ${error.message}`);
        throw error;
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
   
    context.log('=== SUPPLIER REGISTRATION STARTED ===');
    context.log('SaveSupplier function processed a request.');
    context.log('Method:', req.method);
    context.log('Request body:', JSON.stringify(req.body, null, 2));

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


        // Validate request method
        if (req.method !== 'POST') {
            context.log('ERROR: Invalid method:', req.method);
            context.res = {
                status: 405,
                body: { success: false, error: "Method not allowed" }
            };
            return;
        }

        // Validate request body
        if (!req.body) {
            context.log('ERROR: No request body');
            context.res = {
                status: 400,
                body: { success: false, error: "Request body is required" }
            };
            return;
        }

        // Extract all form fields
        const {
            // Step 1: Company Information
            companyName,
            contactPerson,
            email,
            phone,
            address,
            city,
            postalCode,
            country,
            
            // Step 2: VAT Information
            vatNumber,
            
            // Step 3: Bank Information
            iban,
            bic,
            bankName
        } = req.body;
        
        context.log('Extracted form data:', {
            companyName, contactPerson, email, phone,
            address, city, postalCode, country,
            vatNumber, iban, bic, bankName
        });

        // Validate required fields based on your form
        const requiredFields = {
            companyName,
            email,
            vatNumber,
            iban
        };

        const missingFields = Object.keys(requiredFields).filter(field => 
            !requiredFields[field] || requiredFields[field].trim() === ''
        );

        if (missingFields.length > 0) {
            context.log('ERROR: Missing required fields:', missingFields);
            context.res = {
                status: 400,
                body: { 
                    success: false, 
                    error: `Missing required fields: ${missingFields.join(', ')}` 
                }
            };
            return;
        }





         // Get configuration from Key Vault
        const config = await getConfig();
        const emailClient = await getEmailClient();
        
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
        context.log('Connecting to database with Key Vault config...');
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
        context.log('📧 Starting email notifications...');
        const emailResults = {
            confirmation: { success: false },
            notification: { success: false }
        };

        try {
            /*
            // Send confirmation email to supplier
            emailResults.confirmation = await sendConfirmationEmail(sanitized);
            
            // Send notification email to admins
            emailResults.notification = await sendNotificationEmail(sanitized);
            */

            const emailClient = await getEmailClient();
            context.log('✅ Email client obtained successfully');
            
            // Send confirmation email to supplier
            context.log('📧 Sending confirmation email...');
            emailResults.confirmation = await sendConfirmationEmail(sanitized, emailClient, context);
            
            // Send notification email to admins
            context.log('📧 Sending notification email...');
            emailResults.notification = await sendNotificationEmail(sanitized, emailClient, context);

            context.log('📧 Email sending complete:', {
                confirmationSent: emailResults.confirmation.success,
                notificationSent: emailResults.notification.success
            });

        } catch (emailError) {
            context.log('❌ Email sending failed:', emailError);
            context.log('❌ Email error details:', JSON.stringify(emailError, null, 2));
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
        context.log('=== CRITICAL ERROR ===');
        context.log('Error name:', error.name);
        context.log('Error message:', error.message);
        context.log('Error stack:', error.stack);
        
        context.res = {
            status: 500,
            body: { error: "Internal server error" }
        };
    } finally {
        await sql.close();
    }
};