# How to run Payment Portal locally for Development

1.  At repo root run `cp .env.example .env` (Creates `.env` file from `.env.example`)
  - See [.env.example](./.env.example) in this repository for environment variable examples. (Already has the values needed for running locally)
  -  Note that `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` needs to match the `ACCESS_TOKEN` defined in your `.env` in `ustc-pay-gov-test-server`
  - `LOCAL_DEV=true` bypasses AWS SigV4 authentication. Locally there is no API Gateway to verify signatures, so the auth pipeline returns a dummy IAM role ARN (`arn:aws:iam::000000000000:role/local-dev-role`) and skips the Secrets Manager permissions fetch entirely.
2. Run `npm install` at repo root.
3. Run `docker compose up` to spin up a local instance of the Payment Portal database.

#### What if I need to stop my DB?
  - Use `docker compose down` to gracefully stop the DB container. (Removes the container, but keeps the volume with the DB data)
  - Use `docker compose down -v` to gracefully stop the container and **wipe the container's volume**. Note that this will delete any data in your local DB.
4. Open a new terminal window and run `npx ts-node src/devServer.ts`
