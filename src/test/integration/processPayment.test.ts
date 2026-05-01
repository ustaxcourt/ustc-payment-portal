import { signedFetch } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const describeWithEnv = baseUrl ? describe : describe.skip;

describeWithEnv("POST /process", () => {
  const isLocal = baseUrl?.includes("localhost") ?? false;

  const portalFetch = (options: RequestInit) =>
    isLocal
      ? fetch(`${baseUrl}/process`, options)
      : signedFetch(`${baseUrl}/process`, options);

  it("reaches Lambda with a valid-format token (auth diagnostic)", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomUUID() }),
    });
    // Any non-403 means the request passed API Gateway IAM auth and reached Lambda.
    // 200 = Pay.gov accepted; 4xx/5xx from Lambda = Pay.gov rejected or validation error.
    // 403 = API Gateway rejected before Lambda ran (credentials/permissions problem).
    // Expect result NOT TO BE 403
    expect(result.status).not.toBe(403);
  });

  it("returns 400 when required token field is missing", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(result.status).toBe(400);
    const data = await result.json();
    expect(data.message).toBe("Validation error");
    expect(Array.isArray(data.errors)).toBe(true);
    expect(data.errors.length).toBeGreaterThan(0);
  });
});
