import { getSecretString } from "../../clients/secretsClient";

describe("initialize a payment", () => {
  it("makes a request to the local payment portal", async () => {
    let tokenString;
    // When TEST_NAMESPACE is not set, we're running locally and should use the raw secret ID
    if (!process.env.TEST_NAMESPACE) {
      tokenString = process.env.API_ACCESS_TOKEN_SECRET_ID;
    } else {
      tokenString = await getSecretString(
        process.env.API_ACCESS_TOKEN_SECRET_ID as string
      );
    }

    const result = await fetch(`${process.env.BASE_URL}/init`, {
      method: "POST",
      body: JSON.stringify({
        trackingId: "my-tracking-id",
        amount: "10.00",
        appId: "asdf-123",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
      }),
      headers: {
        "Content-Type": "application/json",
        Authentication: `Bearer ${tokenString}`,
      },
    });

    const data = await result.json();
    console.log(result);
    console.log(data);

    expect(result.status).toBe(200);
    expect(data.token).toBeTruthy();
  });
});
