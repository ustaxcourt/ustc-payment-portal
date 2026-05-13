import { authorizedClientAccessToFee } from "./authorizedClientAccessToFee";
import { ClientPermission } from "../types/ClientPermission";

const makeClient = (allowedFeeIds: string[]): ClientPermission => ({
  clientName: "Test Client",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeIds,
});

describe("authorizedClientAccessToFee", () => {
  it("returns true when client has explicit access to feeId", () => {
    const client = makeClient(["fee-1", "fee-2"]);

    expect(authorizedClientAccessToFee(client, "fee-2")).toBe(true);
  });

  it('returns true when client has wildcard "*" access', () => {
    const client = makeClient(["*"]);

    expect(authorizedClientAccessToFee(client, "any-fee-id")).toBe(true);
  });

  it("returns false when client does not have access to feeId", () => {
    const client = makeClient(["fee-1", "fee-3"]);

    expect(authorizedClientAccessToFee(client, "fee-2")).toBe(false);
  });
});
