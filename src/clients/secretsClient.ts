import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

//TODO: Figure out if this should be getSecretBinary or getSecretString OR just getSecret and let the caller determine which piece of the data they would
// like to use 
 export const getSecretBinary = async (input: string)=> {
  const secretName = {
    SecretId: input
  };
        const client = new SecretsManagerClient({});

        const command = new GetSecretValueCommand(secretName);
        const secretResponse =  await client.send(command);

  return secretResponse.SecretBinary;

}
