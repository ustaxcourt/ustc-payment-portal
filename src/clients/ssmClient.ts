import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ServerError } from '../errors/serverError';

const client = new SSMClient({});

// This can be use for authorizedClients 
export async function getParameter(name: string): Promise<string> {
  const result = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new ServerError(`SSM parameter "${name}" not found or empty`);
  return value;
}
