const sql = require('mssql');

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

module.exports = async function (context, req) {
    context.log('SaveSupplier function processed a request.');

    try {
        const supplierData = req.body;

        // Validate required fields
        if (!supplierData.companyName || !supplierData.email || !supplierData.iban) {
            context.res = {
                status: 400,
                body: { error: "Missing required fields" }
            };
            return;
        }

        // Connect to database
        await sql.connect(config);

        const request = new sql.Request();
        
        // Insert supplier data
        const query = `
            INSERT INTO Suppliers (
                CompanyName, ContactPerson, Email, Phone, Address, 
                City, PostalCode, Country, VATNumber, IBAN, BIC, BankName
            ) VALUES (
                @companyName, @contactPerson, @email, @phone, @address,
                @city, @postalCode, @country, @vatNumber, @iban, @bic, @bankName
            )
        `;

        request.input('companyName', sql.NVarChar, supplierData.companyName);
        request.input('contactPerson', sql.NVarChar, supplierData.contactPerson || null);
        request.input('email', sql.NVarChar, supplierData.email);
        request.input('phone', sql.NVarChar, supplierData.phone || null);
        request.input('address', sql.NVarChar, supplierData.address || null);
        request.input('city', sql.NVarChar, supplierData.city || null);
        request.input('postalCode', sql.NVarChar, supplierData.postalCode || null);
        request.input('country', sql.NVarChar, supplierData.country || null);
        request.input('vatNumber', sql.NVarChar, supplierData.vatNumber || null);
        request.input('iban', sql.NVarChar, supplierData.iban);
        request.input('bic', sql.NVarChar, supplierData.bic || null);
        request.input('bankName', sql.NVarChar, supplierData.bankName || null);

        await request.query(query);

        context.res = {
            status: 200,
            body: { message: "Supplier registered successfully" }
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