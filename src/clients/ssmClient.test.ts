import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { getParameterString } from "./ssmClient";

jest.mock("@aws-sdk/client-ssm", () => {
  return {
    SSMClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    GetParameterCommand: jest.fn(),
  };
});

const mockSend = (SSMClient as jest.Mock).mock.results[0]?.value?.send;

describe("getParameterString", () => {
  it("throws when name is missing", async () => {
    await expect(getParameterString("")).rejects.toThrow(
      "getParameterString: name is required",
    );
  });

  it("returns the parameter value", async () => {
    mockSend.mockResolvedValueOnce({ Parameter: { Value: "the-value" } });

    const result = await getParameterString("/ustc/pay-gov/dev/x");
    expect(result).toBe("the-value");
    expect(mockSend).toHaveBeenCalledWith(expect.any(GetParameterCommand));
  });

  it("throws when the parameter has no value", async () => {
    mockSend.mockResolvedValueOnce({ Parameter: {} });

    await expect(getParameterString("/ustc/pay-gov/dev/x")).rejects.toThrow(
      'SSM parameter "/ustc/pay-gov/dev/x" has no value',
    );
  });

  it("propagates AWS SDK errors", async () => {
    mockSend.mockRejectedValueOnce(new Error("AccessDeniedException"));

    await expect(getParameterString("/restricted")).rejects.toThrow(
      "AccessDeniedException",
    );
  });
});
