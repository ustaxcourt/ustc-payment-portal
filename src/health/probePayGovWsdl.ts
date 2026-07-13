import type * as https from "node:https";
import fetch from "node-fetch";

export type WsdlProbeResult = { ok: boolean; latencyMs: number; body: string };

export async function probePayGovWsdl(
  agent: https.Agent | undefined,
  headers: Record<string, string> = {},
): Promise<WsdlProbeResult> {
  const startedAt = Date.now();
  const result = await fetch(`${process.env.SOAP_URL}?wsdl`, { agent, headers });
  const body = await result.text();
  return { ok: result.ok, latencyMs: Date.now() - startedAt, body };
}
