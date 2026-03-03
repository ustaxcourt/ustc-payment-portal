import { getSecretString } from "../../clients/secretsClient";
import { signedFetch } from "./sigv4Helper";

describe("initialize a payment", () => {
  it("makes a request to the local payment portal", async () => {
    let appId;
    const isLocal = process.env.NODE_ENV === "local";
    if (isLocal) {
      appId = process.env.TCS_APP_ID;
    } else {
      appId = await getSecretString(process.env.TCS_APP_ID as string);
    }

    const url = `${process.env.BASE_URL}/init`;
    const options: RequestInit = {
      method: "POST",
      body: JSON.stringify({
        trackingId: "my-tracking-id",
        amount: "10.00",
        appId,
        feeId: "PETITIONS_FILING_FEE",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    };

    // In local dev, API Gateway is not in the loop — plain fetch is fine.
    // In deployed environments, API Gateway enforces AWS_IAM auth — sign with SigV4.
    const result = isLocal ? await fetch(url, options) : await signedFetch(url, options);

    const data = await result.json();
    console.log(result);
    console.log(data);

    expect(result.status).toBe(200);
    expect(data.token).toBeTruthy();
  });
});
