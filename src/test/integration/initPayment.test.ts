describe("initialize a payment", () => {
  it("makes a request to the local payment portal", async () => {
    const result = await fetch("http://localhost:8080/init", {
      method: "POST",
      body: JSON.stringify({
        trackingId: "my-tracking-id",
        amount: 10,
        appId: "asdf-123",
        urlSuccess: "https://example.com",
        urlCancel: "https://example.com",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(result.statusText).toBe(200);
  });
});
