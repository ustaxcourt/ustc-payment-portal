import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export async function getSecretValue(
  secretName: string
): Promise<string | Buffer> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (response.SecretString) {
    return response.SecretString.trim();
  } else if (response.SecretBinary) {
    return Buffer.from(response.SecretBinary);
  } else {
    throw new Error("Secret not found");
  }
}
