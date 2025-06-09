const keyVault = require('../shared/keyVault');

module.exports = async function (context, req) {
    try {
        const secrets = await keyVault.getAllSecrets();
        
        context.res = {
            status: 200,
            body: {
                success: true,
                message: "Key Vault access successful",
                secrets: {
                    sqlPassword: secrets.sqlPassword ? "✅ Retrieved" : "❌ Missing",
                    communicationString: secrets.communicationConnectionString ? "✅ Retrieved" : "❌ Missing",
                    adminEmails: secrets.adminEmails ? "✅ Retrieved" : "❌ Missing"
                }
            }
        };
    } catch (error) {
        context.res = {
            status: 500,
            body: {
                success: false,
                error: error.message,
                details: "Check Key Vault permissions and secret names"
            }
        };
    }
};