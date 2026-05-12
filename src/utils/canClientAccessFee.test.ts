import { canClientAccessFee } from "./canClientAccessFee";
import { ClientPermission } from "../types/ClientPermission";

const makeClient = (allowedFeeIds: string[]): ClientPermission => ({
  clientName: "Test Client",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeIds,
});

describe("canClientAccessFee", () => {
  it("returns true when client has explicit access to feeId", () => {
    const client = makeClient(["fee-1", "fee-2"]);

    expect(canClientAccessFee(client, "fee-2")).toBe(true);
  });

  it('returns true when client has wildcard "*" access', () => {
    const client = makeClient(["*"]);

    expect(canClientAccessFee(client, "any-fee-id")).toBe(true);
  });

  it("returns false when client does not have access to feeId", () => {
    const client = makeClient(["fee-1", "fee-3"]);

    expect(canClientAccessFee(client, "fee-2")).toBe(false);
  });
});
