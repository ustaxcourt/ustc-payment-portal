import { isLocal } from "../../config/appEnv";
import { signedFetch } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const describeWithEnv = baseUrl ? describe : describe.skip;

describeWithEnv("POST /init", () => {
  const portalFetch = (options: RequestInit, path = "/init") =>
    isLocal()
      ? fetch(`${baseUrl}${path}`, options)
      : signedFetch(`${baseUrl}${path}`, options);

  it("returns 200 with token and paymentRedirect for a valid request", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionReferenceId: crypto.randomUUID(),
        fee: "PETITION_FILING_FEE",
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
      fee: "PETITION_FILING_FEE",
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
        fee: "PETITION_FILING_FEE",
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

  it("returns 409 instead of a new token when the obligation has already been paid", async () => {
    const transactionReferenceId = crypto.randomUUID();

    const first = await portalFetch(initOptions(transactionReferenceId));
    const firstData = await first.json();
    expect(first.status).toBe(200);

    await markPaid(firstData.paymentRedirect, firstData.token);

    const processed = await portalFetch(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: firstData.token }),
      },
      "/process",
    );
    expect((await processed.json()).paymentStatus).toBe("success");

    const second = await portalFetch(initOptions(transactionReferenceId));
    const secondData = await second.json();

    expect(second.status).toBe(409);
    expect(secondData.token).toBeUndefined();
    expect(secondData.message).toMatch(/already been paid/i);
  });

  it("still allows a retry after a failed attempt", async () => {
    const transactionReferenceId = crypto.randomUUID();

    const first = await portalFetch(initOptions(transactionReferenceId));
    const firstData = await first.json();
    await markPaid(firstData.paymentRedirect, firstData.token, "Failed");
    await portalFetch(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: firstData.token }),
      },
      "/process",
    );

    const second = await portalFetch(initOptions(transactionReferenceId));
    const secondData = await second.json();

    expect(second.status).toBe(200);
    expect(secondData.token).not.toBe(firstData.token);
  });

  const initOptions = (transactionReferenceId: string): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionReferenceId,
      fee: "PETITION_FILING_FEE",
      urlSuccess: "https://example.com",
      urlCancel: "https://example.com",
      metadata: { docketNumber: "123-26" },
    }),
  });

  const markPaid = async (
    paymentRedirect: string,
    token: string,
    status = "Success",
  ) => {
    const markUrl = new URL(paymentRedirect);
    const payPath = markUrl.pathname.endsWith("/pay")
      ? markUrl.pathname
      : `${markUrl.pathname.replace(/\/$/, "")}/pay`;
    markUrl.pathname = `${payPath}/PLASTIC_CARD/${status}`;
    markUrl.searchParams.set("token", token);

    const result = await fetch(markUrl, { method: "POST" });
    if (!result.ok) {
      throw new Error(
        `Failed to mark payment: ${result.status} ${await result.text()}`,
      );
    }
  };
});
