import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({});

export async function getSecretString(secretId: string): Promise<string> {
  if (!secretId) throw new Error("getSecretString: secretId is required");

  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (res.SecretString) return res.SecretString;
  if (res.SecretBinary) return Buffer.from(res.SecretBinary as any).toString("utf-8");

  throw new Error(`Secret "${secretId}" has no SecretString or SecretBinary`);
}
