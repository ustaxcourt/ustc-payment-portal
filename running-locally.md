# How to run Payment Portal locally for Development

- Create a `.env` and add the following:

```
BASE_URL="http://localhost:8080"
CERT_PASSPHRASE=""
CLIENT_PERMISSIONS_SECRET_ID="ustc/pay-gov/dev/client-permissions"
NODE_ENV="local"
PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID="development-token"
# These can be local host of our mock pay.gov test server, or the URL of the hosted version of the mock pay.gov test server.
# Point to LOCAL Pay.gov test server
SOAP_URL="http://localhost:3366/wsdl"
PAYMENT_URL="http://localhost:3366/pay"
SUBDOMAIN=""
TCS_APP_ID=asdf-123

# Database Configuration
# Only need to worry about local DB config here since in other environments we will pull from Secrets Manager + RDS_ENDPOINT in Teraform
DB_HOST=localhost
DB_PORT=5433
DB_USER=user
DB_PASSWORD=password
DB_NAME=mydb

# API Configuration
API_PORT=8080

# CORS Configuration - set to your Dashboard URL
# localhost:3000 (local) || https://dashboard.dev-payments.ustaxcourt.gov
DASHBOARD_ALLOWED_ORIGIN="http://localhost:3000"
```

- Note that `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` needs to match the `ACCESS_TOKEN` defined in your `.env` in `ustc-pay-gov-test-server`
- `LOCAL_DEV=true` bypasses AWS SigV4 authentication. Locally there is no API Gateway to verify signatures, so the auth pipeline returns a dummy IAM role ARN (`arn:aws:iam::000000000000:role/local-dev-role`) and skips the Secrets Manager permissions fetch entirely.
- Run `npm install`
- Run `npx ts-node src/devServer.ts`
