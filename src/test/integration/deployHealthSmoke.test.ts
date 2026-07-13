import { signedFetch } from "./sigv4Helper";

jest.setTimeout(30000); // health check fans out to RDS, SSM, Secrets, Pay.gov

const hasSigningCredentials =
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY);

const mustGetBaseUrl = (): string => {
  const url = process.env.BASE_URL;
  if (!url) {
    throw new Error("BASE_URL is required for the deploy health smoke test");
  }
  return url;
};

/**
 * Post-deploy health gate. Signs GET /health with the caller's AWS credentials
 * (execute-api:Invoke) and asserts every dependency check passed. Unlike /init,
 * /health does NOT call authorizeClient, so no client-permissions entry is needed.
 */
const describeWithCreds = hasSigningCredentials ? describe : describe.skip;

describeWithCreds("GET /health deploy gate", () => {
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = mustGetBaseUrl();
  });

  it("returns 200 with all checks ok", async () => {
    const result = await signedFetch(`${baseUrl}/health`, { method: "GET" });
    const report = await result.json();
    console.log("HEALTH_STATUS=", result.status, JSON.stringify(report, null, 2));

    expect(result.status).toBe(200);
    expect(report.status).toBe("healthy");
    for (const check of Object.values(report.checks)) {
      expect(check).toMatchObject({ status: "ok" });
    }
  });

  it("unsigned GET /health returns 403", async () => {
    const result = await fetch(`${baseUrl}/health`, { method: "GET" });
    expect(result.status).toBe(403);
  });
});
