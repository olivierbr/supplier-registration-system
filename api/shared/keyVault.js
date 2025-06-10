const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

class KeyVaultService {
    constructor() {
        const vaultName = process.env.KEY_VAULT_NAME || "supplier-keyvault-ris";
        const vaultUrl = `https://${vaultName}.vault.azure.net/`;
        
        const credential = new DefaultAzureCredential();
        this.client = new SecretClient(vaultUrl, credential);
        this.cache = new Map();
    }

    async getSecret(secretName) {
        // Use cache to avoid repeated API calls
        if (this.cache.has(secretName)) {
            return this.cache.get(secretName);
        }

        try {
            const secret = await this.client.getSecret(secretName);
            this.cache.set(secretName, secret.value);
            return secret.value;
        } catch (error) {
            console.error(`Error getting secret ${secretName}:`, error);
            
            // Fallback to environment variables for development
            const envMapping = {
                'sql-password': 'SQL_PASSWORD',
                'communication-connection-string': 'COMMUNICATION_SERVICES_CONNECTION_STRING',
                'admin-emails': 'ADMIN_EMAILS'
            };
            
            const envVar = envMapping[secretName];
            if (envVar && process.env[envVar]) {
                return process.env[envVar];
            }
            
            throw error;
        }
    }

    async getAllSecrets() {
        try {
            return {
                sqlPassword: await this.getSecret('sql-password'),
                communicationConnectionString: await this.getSecret('communication-connection-string'),
                adminEmails: await this.getSecret('admin-emails')
            };
        } catch (error) {
            console.error('Error getting secrets from Key Vault:', error);
            throw error;
        }
    }
}

module.exports = new KeyVaultService();