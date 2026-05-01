import { isLocal } from "../../config/appEnv";
import { signedFetch } from "./sigv4Helper";

const baseUrl = process.env.BASE_URL;
const isDeployed = baseUrl && !baseUrl.includes("localhost");
const describeWithEnv = isDeployed ? describe : describe.skip;

describeWithEnv("GET /details/{transactionReferenceId}", () => {
  const portalFetch = (path: string) =>
    isLocal()
      ? fetch(`${baseUrl}${path}`)
      : signedFetch(`${baseUrl}${path}`, { method: "GET" });

  it("returns 400 when transactionReferenceId is not a valid UUID", async () => {
    const result = await portalFetch(`/details/not-a-uuid`);

    expect(result.status).toBe(400);
    const data = await result.json();
    expect(data.message).toBe("Transaction Reference Id was invalid");
  });

  it("returns 404 when transactionReferenceId is a valid UUID but no transaction exists", async () => {
    const result = await portalFetch(`/details/${crypto.randomUUID()}`);

    // Any non-403 means the request passed API Gateway IAM auth and reached Lambda.
    // 404 = use case threw NotFoundError; 403 here would mean credentials/permissions problem.
    expect(result.status).not.toBe(403);
    expect(result.status).toBe(404);
  });

  it("reaches Lambda with a valid UUID (auth diagnostic)", async () => {
    const result = await portalFetch(`/details/${crypto.randomUUID()}`);
    // 403 = API Gateway rejected before Lambda ran (credentials/permissions problem).
    expect(result.status).not.toBe(403);
  });
});
