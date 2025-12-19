# USTC Payment Portal

This package makes SOAP requests to the pay.gov hosted collection pages service.

The application is intended to handle API requests from USTC applications and then make requests to Pay.gov on its behalf.

## Workflow

1. An application makes a request to initiate a transaction the Payment Portal.
2. The portal then performs a `startOnlineCollection` request to Pay.gov with the transaction information.
3. Pay.gov responds with a token, which the portal uses to generate a redirect URL to Pay.gov to enter in payment information.
4. The token and URL are returned to the original App, which stores the token and forwards the user to the redirect URL.
5. The user enters their payment information or cancels, which sends them back to the success or cancel URL specified in the original request.
6. Once back on the originating app, the app makes another request to the Payment Portal to process the transaction.
7. The payment portal calls Pay.gov to perform a `completeOnlineCollection` with the token.
8. Pay.gov responds with a Tracking ID, which is relayed back to the App via the Portal.

## Environment Variables

Environment variables are located in `.env.<NODE_ENV>`.

Stages should be one of `dev`, `stg`, and `prod`. The dev server should be configured to point to the USTC Pay.gov test server, which is managed in a [separate repository](https://github.com/ustaxcourt/ustc-pay-gov-test-server).

| Environment Variable | Description                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `API_ACCESS_TOKEN`   | An optional token that is used to make authorized requests to the development portal                             |
| `BASE_URL`           | The URL of this payment portal (for running integration tests)                                                   |
| `CERT_PASSPHRASE`    | The secret password for using the certificate as an httpsAgent                                                   |
| `NODE_ENV`           | The environment or stage for this application (`staging`, `development`, or `production`)                        |
| `PAYMENT_URL`        | The URL of the Payment UI where the user is forwarded once a transaction request has been successfully initiated |
| `SOAP_URL`           | The URL of the SOAP Server that handles payment requests made by this portal                                     |
| `SUBDOMAIN`          | The subdomain that the deployed application should assume                                                        |
| `TCS_APP_ID`         | The identifier granted by Pay.gov for using their service (used for testing)                                     |

## Deployment

This gets deployed to the USTC Website AWS Account using Terraform. You will need credentials loaded in order to perform this operation. And you will need the above environment variables specified.

See the `terraform/` directory for deployment configuration and instructions.

## Testing

Right now there aren't many unit tests, but there are some integration tests that test the deployed application at the base url and the apiToken specified in `.env.dev`:

```bash
npm run test
```

## Publishing to npmjs.org

This package is published to npmjs.org as `@ustaxcourt/payment-portal` and can be installed via:

```bash
npm install --save-dev @ustaxcourt/payment-portal
```

### Publishing Process

1. **Make changes** on a feature branch
2. **Add a changeset** to document your changes:
   ```bash
   npx changeset add
   ```
   - Select the package and bump type (patch/minor/major)
   - Write a concise summary for the changelog
3. **Open a PR** and merge to `main`
4. **Review and merge** the "Version Packages" PR that Changesets automatically creates
5. **Automatic publish** via GitHub Actions to npm with provenance

For detailed instructions, see [PUBLISHING.md](./PUBLISHING.md).
