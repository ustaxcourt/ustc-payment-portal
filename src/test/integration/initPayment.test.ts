import Knex from "knex";
import { isLocal } from "../../config/appEnv";
import { signedFetch } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const describeWithEnv = baseUrl ? describe : describe.skip;

describeWithEnv("POST /init", () => {
  const portalFetch = (options: RequestInit) =>
    isLocal()
      ? fetch(`${baseUrl}/init`, options)
      : signedFetch(`${baseUrl}/init`, options);

  it("returns 200 with token and paymentRedirect for a valid request", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionReferenceId: crypto.randomUUID(),
        feeId: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
        metadata: { docketNumber: "123-26" },
      }),
    });

    const data = await result.json();

    expect(result.status).toBe(200);
    expect(data.token).toBeTruthy();
    expect(data.paymentRedirect).toBeTruthy();
  });

  it("returns the same token on a second call with the same transactionReferenceId (fresh token reuse)", async () => {
    const body = JSON.stringify({
      transactionReferenceId: crypto.randomUUID(),
      feeId: "PETITION_FILING_FEE",
      urlSuccess: "https://example.com",
      urlCancel: "https://example.com",
      metadata: { docketNumber: "123-26" },
    });
    const options: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    };

    const first = await portalFetch(options);
    const firstData = await first.json();
    expect(first.status).toBe(200);

    const second = await portalFetch(options);
    const secondData = await second.json();
    expect(second.status).toBe(200);

    expect(secondData.token).toBe(firstData.token);
    expect(secondData.paymentRedirect).toBe(firstData.paymentRedirect);
  });

  it("returns different tokens for different transactionReferenceIds", async () => {
    const makeBody = () =>
      JSON.stringify({
        transactionReferenceId: crypto.randomUUID(),
        feeId: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
        metadata: { docketNumber: "123-26" },
      });

    const [first, second] = await Promise.all([
      portalFetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: makeBody(),
      }),
      portalFetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: makeBody(),
      }),
    ]);

    const [firstData, secondData] = await Promise.all([
      first.json(),
      second.json(),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstData.token).not.toBe(secondData.token);
  });

  it("generates a new token when the existing one is expired (>3h)", async () => {
    const transactionReferenceId = crypto.randomUUID();
    const expiredPaygovToken = crypto.randomUUID().replace(/-/g, ""); // 32 chars with the dashes removed.

    // Seed an expired initiated record directly.
    // We can't use getKnex() here — Jest forces NODE_ENV=test which makes knex.ts
    // append _test to DB_NAME, pointing at the wrong database.
    const seedKnex = Knex({
      client: "pg",
      connection: {
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? "5433"),
        user: process.env.DB_USER ?? "user",
        password: process.env.DB_PASSWORD ?? "password",
        database: process.env.DB_NAME ?? "mydb",
      },
    });
    await seedKnex("transactions").insert({
      agency_tracking_id: crypto.randomUUID().replace(/-/g, "").slice(0, 21),
      transaction_reference_id: transactionReferenceId,
      fee_name: "Petition Filing Fee",
      fee_id: "PETITION_FILING_FEE",
      fee_amount: 60,
      client_name: "DAWSON",
      payment_status: "pending",
      payment_method: "plastic_card",
      transaction_status: "initiated",
      paygov_token: expiredPaygovToken,
      last_updated_at: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    });
    await seedKnex.destroy();

    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionReferenceId,
        feeId: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
        metadata: { docketNumber: "123-26" },
      }),
    });
    const data = await result.json();

    expect(result.status).toBe(200);
    expect(data.token).not.toBe(expiredPaygovToken); // new token issued
    expect(data.token).toBeTruthy();
  });
});
