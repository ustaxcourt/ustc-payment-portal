import { signedFetch } from "./sigv4Helper";

describe("POST /init", () => {
  const url = `${process.env.BASE_URL}/init`;
  const isLocal = process.env.NODE_ENV === "local";

  const portalFetch = (options: RequestInit) =>
    isLocal ? fetch(url, options) : signedFetch(url, options);

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
    expect(data.paymentRedirect).toContain(data.token);
  });

  it("returns 400 for a request with missing required fields", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeId: "PETITION_FILING_FEE" }),
    });

    expect(result.status).toBe(400);
  });
});
