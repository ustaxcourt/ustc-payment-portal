import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});

export async function getParameterString(name: string): Promise<string> {
  if (!name) throw new Error("getParameterString: name is required");

  const res = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );

  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter "${name}" has no value`);
  return value;
}
