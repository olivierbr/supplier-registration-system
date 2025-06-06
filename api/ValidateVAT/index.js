module.exports = async function (context, req) {
    context.log('ValidateVAT function processed a request.');

    try {
        const { vatNumber } = req.body;

        if (!vatNumber) {
            context.res = {
                status: 400,
                body: { error: "VAT number is required" }
            };
            return;
        }

        // Simple VAT validation for Belgian VAT numbers
        // In production, you might want to use EU VAT validation service
        const belgianVATPattern = /^BE[0-9]{10}$/;
        const isValid = belgianVATPattern.test(vatNumber.replace(/\s/g, ''));

        context.res = {
            status: 200,
            body: { 
                valid: isValid,
                vatNumber: vatNumber,
                message: isValid ? "Valid Belgian VAT number" : "Invalid VAT number format"
            }
        };

    } catch (error) {
        context.log.error('Error validating VAT:', error);
        context.res = {
            status: 500,
            body: { error: "Internal server error" }
        };
    }
};