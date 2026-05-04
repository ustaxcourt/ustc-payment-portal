import { isLocal } from "../../config/appEnv";
import { signedFetch } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const isDeployed = baseUrl && !baseUrl.includes("localhost");
const describeWithEnv = isDeployed ? describe : describe.skip;

describeWithEnv("POST /init", () => {
  const portalFetch = (options: RequestInit) =>
    isLocal() ? fetch(`${baseUrl}/init`, options) : signedFetch(`${baseUrl}/init`, options);

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
    const options: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body };

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
    const makeBody = () => JSON.stringify({
      transactionReferenceId: crypto.randomUUID(),
      feeId: "PETITION_FILING_FEE",
      urlSuccess: "https://example.com",
      urlCancel: "https://example.com",
      metadata: { docketNumber: "123-26" },
    });

    const [first, second] = await Promise.all([
      portalFetch({ method: "POST", headers: { "Content-Type": "application/json" }, body: makeBody() }),
      portalFetch({ method: "POST", headers: { "Content-Type": "application/json" }, body: makeBody() }),
    ]);

    const [firstData, secondData] = await Promise.all([first.json(), second.json()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstData.token).not.toBe(secondData.token);
  });
});
