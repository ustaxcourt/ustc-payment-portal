import { signedFetch } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const isDeployed = baseUrl && !baseUrl.includes("localhost");
const describeWithEnv = isDeployed ? describe : describe.skip;

describeWithEnv("POST /process", () => {
  const isLocal = process.env.NODE_ENV === "local";

  const portalFetch = (options: RequestInit) =>
    isLocal
      ? fetch(`${baseUrl}/process`, options)
      : signedFetch(`${baseUrl}/process`, options);

  it("returns 400 when body is malformed JSON", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    expect(result.status).toBe(400);
    const data = await result.json();
    expect(data.message).toContain("invalid JSON");
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

  it("returns 400 when request has unknown fields (strict mode)", async () => {
    const result = await portalFetch({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "abc", extra: "not-allowed" }),
    });

    expect(result.status).toBe(400);
    const data = await result.json();
    expect(data.message).toBe("Validation error");
  });
});
