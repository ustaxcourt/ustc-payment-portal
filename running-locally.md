# How to run Payment Portal locally for Development
- Create a `.env.dev` and add the following:
```
# Point to LOCAL test server
SOAP_URL="http://localhost:3366/wsdl"
PAYMENT_URL="http://localhost:3366/pay"

# Test credentials
TCS_APP_ID="ustc-test-pay-gov-app"

# Local settings
NODE_ENV="local"
BASE_URL="http://localhost:8080"

# Don't use Secrets Manager for local dev
API_ACCESS_TOKEN_SECRET_ID=""
CERT_PASSPHRASE_SECRET_ID=""

# Local test server token (must match what you entered when starting test server)
# This will be used directly since NODE_ENV=local
PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID="asdf123"
```
- Note that `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` needs to match the `ACCESS_TOKEN` defined in your `.env` in `ustc-pay-gov-test-server`
- Run `npm install`
- Run `npx ts-node src/devServer.ts`
