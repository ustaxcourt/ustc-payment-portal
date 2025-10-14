import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getSecretString } from "./secretsClient";

jest.mock("@aws-sdk/client-secrets-manager", () => {
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    GetSecretValueCommand: jest.fn(),
  };
});

const mockSend = (SecretsManagerClient as jest.Mock).mock.results[0]?.value?.send;

describe("getSecretString", () => {
  it("throws an error if secretId is missing", async () => {
    await expect(getSecretString("")).rejects.toThrow("getSecretString: secretId is required");
  });

  it("returns the SecretString when available", async () => {
    mockSend.mockResolvedValueOnce({ SecretString: "my-secret-value" });

    const result = await getSecretString("my-secret-id");
    expect(result).toBe("my-secret-value");

    expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
  });

  it("returns decoded SecretBinary when SecretString is not available", async () => {
    const binaryValue = Buffer.from("binary-secret").toString("utf-8");
    mockSend.mockResolvedValueOnce({ SecretBinary: binaryValue });

    const result = await getSecretString("binary-secret-id");
    expect(result).toBe("binary-secret");
  });

  it("throws an error when no SecretString or SecretBinary is present", async () => {
    mockSend.mockResolvedValueOnce({});

    await expect(getSecretString("empty-secret-id")).rejects.toThrow(
      'Secret "empty-secret-id" has no SecretString or SecretBinary'
    );
  });

  it("handles AWS SDK errors gracefully", async () => {
    mockSend.mockRejectedValueOnce(new Error("AccessDeniedException"));

    await expect(getSecretString("restricted-secret")).rejects.toThrow("AccessDeniedException");
  });
});
