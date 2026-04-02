import { signedFetch } from "./sigv4Helper";
import TransactionModel from "../../db/TransactionModel";
import knex from "../../db/knex";

describe("initialize a payment", () => {
  const isLocal = process.env.NODE_ENV === "local";
  const transactionReferenceId = crypto.randomUUID();

  afterAll(async () => {
    if (isLocal) {
      await TransactionModel.query()
        .where({ transactionReferenceId })
        .delete();
      await knex.destroy();
    }
  });

  it("returns a token and paymentRedirect for a valid request", async () => {
    const url = `${process.env.BASE_URL}/init`;
    const options: RequestInit = {
      method: "POST",
      body: JSON.stringify({
        transactionReferenceId,
        feeId: "PETITION_FILING_FEE",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
        metadata: { docketNumber: "123-26" },
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };

    // In local dev, API Gateway is not in the loop — plain fetch is fine.
    // In deployed environments, API Gateway enforces AWS_IAM auth — sign with SigV4.
    const result = isLocal ? await fetch(url, options) : await signedFetch(url, options);
    const data = await result.json();

    expect(result.status).toBe(200);
    expect(data.token).toBeTruthy();
    expect(data.paymentRedirect).toBeTruthy();
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
});
