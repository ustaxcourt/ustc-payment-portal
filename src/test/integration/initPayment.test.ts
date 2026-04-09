import { signedFetch } from "./sigv4Helper";
import TransactionModel from "../../db/TransactionModel";
import knex from "../../db/knex";

const baseUrl = process.env.BASE_URL;
const hasBaseUrl = !!baseUrl;
const describeWithEnv = hasBaseUrl ? describe : describe.skip;

describeWithEnv("POST /init", () => {
  const isLocal = process.env.NODE_ENV === "local";
  const transactionReferenceId = crypto.randomUUID();

  const portalFetch = (options: RequestInit) =>
    isLocal
      ? fetch(`${baseUrl}/init`, options)
      : signedFetch(`${baseUrl}/init`, options);

  it("returns 200 with token and paymentRedirect for a valid request", async () => {
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
    expect(data.token).toBeTruthy();
    expect(data.paymentRedirect).toContain(data.token);
  });

  it("saves the transaction with status initiated after a successful Pay.gov call", async () => {
    if (!isLocal) {
      console.log("Skipping: DB assertions require local RDS access");
      return;
    }

    const transaction = await TransactionModel.query()
      .where({ transactionReferenceId })
      .first();

    expect(transaction).toBeDefined();
    expect(transaction!.transactionStatus).toBe("initiated");
    expect(transaction!.paygovToken).toBeTruthy();
  });

  it("returns 400 for a request with missing required fields", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeId: "PETITION_FILING_FEE" }),
    });

    expect(result.status).toBe(400);
  });

  afterAll(async () => {
    if (isLocal && knex) {
      await TransactionModel.query().where({ transactionReferenceId }).delete();
      if (typeof knex.destroy === "function") {
        await knex.destroy();
      }
    }
  });
});
