const { SecretClient } = require("@azure/keyvault-secrets");
const { ClientSecretCredential } = require("@azure/identity");

module.exports = async function (context, req) {
    context.log('TestKeyVault function started');
    
    try {
        // Check required environment variables
        const requiredEnvVars = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'KEY_VAULT_URL'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            context.res = {
                status: 500,
                body: {
                    success: false,
                    error: `Missing required environment variables: ${missingVars.join(', ')}`,
                    hint: "Add these to Static Web App Configuration",
                    requiredVars: requiredEnvVars
                }
            };
            return;
        }

        // Create credential using service principal
        const credential = new ClientSecretCredential(
            process.env.AZURE_TENANT_ID,
            process.env.AZURE_CLIENT_ID,
            process.env.AZURE_CLIENT_SECRET
        );

        // Create Key Vault client
        const client = new SecretClient(process.env.KEY_VAULT_URL, credential);
        
        context.log('Attempting to list secrets...');
        
        // Test by listing secrets (don't retrieve values for security)
        const secretsIterator = client.listPropertiesOfSecrets();
        const secrets = [];
        
        let count = 0;
        for await (const secretProperties of secretsIterator) {
            secrets.push({
                name: secretProperties.name,
                enabled: secretProperties.enabled,
                createdOn: secretProperties.createdOn
            });
            count++;
            
            // Limit to first 10 secrets for testing
            if (count >= 10) break;
        }
        
        context.log(`Successfully found ${secrets.length} secrets`);
        
        // Test retrieving one specific secret (if it exists)
        let secretValue = null;
        try {
            if (secrets.length > 0) {
                const firstSecret = await client.getSecret(secrets[0].name);
                secretValue = `${firstSecret.value.substring(0, 5)}...`; // Show only first 5 chars for security
            }
        } catch (secretError) {
            context.log('Could not retrieve secret value:', secretError.message);
        }

        context.res = {
            status: 200,
            body: {
                success: true,
                message: "Key Vault connection successful!",
                authMethod: "ClientSecretCredential (Service Principal)",
                vaultUrl: process.env.KEY_VAULT_URL,
                secretsFound: secrets.length,
                secrets: secrets,
                sampleSecretPreview: secretValue,
                timestamp: new Date().toISOString()
            }
        };
        
    } catch (error) {
        context.log.error('Key Vault test failed:', error);
        
        // Provide helpful error messages
        let helpfulMessage = error.message;
        
        if (error.message.includes('401')) {
            helpfulMessage = "Authentication failed. Check your AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID";
        } else if (error.message.includes('403')) {
            helpfulMessage = "Access denied. The service principal doesn't have permissions to access this Key Vault";
        } else if (error.message.includes('404')) {
            helpfulMessage = "Key Vault not found. Check your KEY_VAULT_URL";
        }
        
        context.res = {
            status: 500,
            body: {
                success: false,
                error: helpfulMessage,
                originalError: error.message,
                authMethod: "ClientSecretCredential (Service Principal)",
                vaultUrl: process.env.KEY_VAULT_URL || "Not set",
                troubleshooting: {
                    step1: "Verify service principal exists: az ad sp list --display-name 'supplier-registration-sp'",
                    step2: "Check Key Vault permissions: Go to Key Vault → Access control (IAM)",
                    step3: "Verify environment variables are set in Static Web App Configuration",
                    step4: "Make sure KEY_VAULT_URL format: https://vaultname.vault.azure.net/"
                }
            }
        };
    }
};